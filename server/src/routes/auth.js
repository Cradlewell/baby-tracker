import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authDb, withTransaction } from '../db.js';
import { config } from '../config.js';
import { issueOtp, verifyOtp } from '../otp.js';
import {
  createSession, revokeSession, requireAuth, findClientById, openOwnClient,
} from '../sessions.js';
import { ApiError, badRequest, conflict, notFound, unauthorized, forbidden } from '../errors.js';
import {
  requireEmail, requireName, requirePhone, requireNewPassword, requireOtp, maskPhone, requireRole,
} from '../validation.js';
import { limiter } from '../rateLimit.js';
import crypto from 'node:crypto';
import { verifyGoogleIdToken, makeSignupTicket, readSignupTicket } from '../google.js';

export const authRouter = Router();

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

async function findUserByEmail(email) {
  const [rows] = await authDb.query(
    'SELECT id, full_name, phone, email, password_hash, verification_status, role, google_sub FROM users WHERE email = ?',
    [email]
  );
  return rows[0] || null;
}

const publicUser = (u) => ({ id: u.id, fullName: u.full_name, email: u.email, phone: u.phone, role: u.role });
const publicClient = (c) => ({ id: c.id, name: c.name, phoneMasked: maskPhone(c.phone) });
const ROLE_NAME = { nurse: 'Nurse', client: 'Client' };

// Creates an account, replacing unfinished sign-ups with the same email or phone. Without
// OTP the account is active at once; with OTP it waits for the phone code.
// Two sign-ups for the same email or phone at once (a double tap): one wins, the other replaced
// it or hit the same rows. Answer "try again" instead of a server error.
const RACE_ERRORS = new Set(['ER_DUP_ENTRY', 'ER_NO_REFERENCED_ROW_2', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);
async function signupRace(fn) {
  try {
    return await fn();
  } catch (err) {
    if (RACE_ERRORS.has(err?.code)) {
      throw conflict('signup_busy', 'This sign-up is already being processed. Please wait a moment and try again.');
    }
    throw err;
  }
}

async function createUser(args) {
  return signupRace(() => insertUser(args));
}

async function insertUser({ name, phoneE164, emailLc, passwordHash, role, googleSub = null, verifiedNow = !config.otpEnabled }) {
  return withTransaction(authDb, async (conn) => {
    const [existing] = await conn.query(
      'SELECT id, email, phone, verification_status FROM users WHERE email = ? OR phone = ? FOR UPDATE',
      [emailLc, phoneE164]
    );
    const verified = existing.filter((u) => u.verification_status === 'verified');
    if (verified.some((u) => u.email === emailLc)) {
      throw conflict('email_taken', 'An account with this email already exists. Please log in.');
    }
    if (verified.some((u) => u.phone === phoneE164)) {
      throw conflict('phone_taken', 'This phone number is already registered to another account.');
    }
    // Unfinished sign-ups never verified their phone; a new registration replaces them.
    const pendingIds = existing.map((u) => u.id);
    if (pendingIds.length) await conn.query('DELETE FROM users WHERE id IN (?)', [pendingIds]);

    const [result] = await conn.query(
      `INSERT INTO users (full_name, phone, email, password_hash, verification_status, verified_at, role, google_sub)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, phoneE164, emailLc, passwordHash,
        verifiedNow ? 'verified' : 'pending', verifiedNow ? new Date() : null, role, googleSub]
    );
    return result.insertId;
  });
}

// Signs the user in: a parent goes straight to their own records, a nurse picks a client next.
async function sendSession(res, user, status = 200) {
  if (user.role === 'client') {
    const client = await openOwnClient(user);
    const token = await createSession(user.id, client.id);
    return res.status(status).json({ token, user: publicUser(user), client: publicClient(client) });
  }
  const token = await createSession(user.id);
  return res.status(status).json({ token, user: publicUser(user), client: null });
}

// 1. Registration: creates a pending account and texts an OTP to the phone number.
authRouter.post('/register', limiter('otp-send', 5), async (req, res) => {
  const { fullName, phone, email, password, confirmPassword } = req.body || {};
  const role = requireRole(req.body?.role);
  const name = requireName(fullName);
  const phoneE164 = requirePhone(phone);
  const emailLc = requireEmail(email);
  requireNewPassword(password, confirmPassword);

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  const userId = await createUser({ name, phoneE164, emailLc, passwordHash, role });

  if (!config.otpEnabled) {
    return res.status(201).json({ email: emailLc, otpRequired: false });
  }
  const { expiresInSeconds } = await signupRace(() => issueOtp({ purpose: 'registration', userId, phone: phoneE164 }));
  res.status(201).json({ email: emailLc, otpRequired: true, phoneMasked: maskPhone(phoneE164), expiresInSeconds });
});

// The code-based endpoints exist only while OTP is switched on.
function requireOtpEnabled(_req, _res, next) {
  if (!config.otpEnabled) return next(new ApiError(410, 'otp_disabled', 'Verification codes are switched off. Please log in.'));
  next();
}

authRouter.post('/register/resend', requireOtpEnabled, limiter('otp-send', 5), async (req, res) => {
  const email = requireEmail(req.body?.email);
  const user = await findUserByEmail(email);
  if (!user) throw notFound('not_registered', 'No sign-up found for this email. Please register again.');
  if (user.verification_status === 'verified') {
    throw conflict('already_verified', 'This account is already verified. Please log in.');
  }
  const { expiresInSeconds } = await issueOtp({ purpose: 'registration', userId: user.id, phone: user.phone });
  res.json({ email, phoneMasked: maskPhone(user.phone), expiresInSeconds });
});

// Verifying the OTP activates the account. The app then sends the user to the login screen.
authRouter.post('/register/verify', requireOtpEnabled, limiter('otp-verify', 20), async (req, res) => {
  const email = requireEmail(req.body?.email);
  const code = requireOtp(req.body?.otp);
  const user = await findUserByEmail(email);
  if (!user) throw notFound('not_registered', 'No sign-up found for this email. Please register again.');
  if (user.verification_status === 'verified') {
    throw conflict('already_verified', 'This account is already verified. Please log in.');
  }
  await verifyOtp({ purpose: 'registration', userId: user.id, phone: user.phone, code });
  await authDb.query(
    "UPDATE users SET verification_status = 'verified', verified_at = UTC_TIMESTAMP() WHERE id = ?",
    [user.id]
  );
  res.json({ verified: true });
});

// 2. Login with email and password.
authRouter.post('/login', limiter('login', 10), async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const role = requireRole(req.body?.role);
  const user = email ? await findUserByEmail(email) : null;

  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw unauthorized('invalid_credentials', 'Incorrect email or password.');

  // Checked after the password, so the answer never reveals which kind an unknown email is.
  if (user.role !== role) {
    throw forbidden('wrong_role',
      `This is a ${ROLE_NAME[user.role]} account. Choose "${ROLE_NAME[user.role]}" above to log in.`);
  }

  if (user.verification_status !== 'verified') {
    if (config.otpEnabled) {
      throw forbidden('account_not_verified', 'Your phone number is not verified yet. Verify it to finish creating your account.');
    }
    // Signed up while codes were on but never entered one: with codes off, activate on login.
    await authDb.query(
      "UPDATE users SET verification_status = 'verified', verified_at = UTC_TIMESTAMP() WHERE id = ?",
      [user.id]
    );
  }

  // A client (parent) goes straight to their own records: the session opens their own client.
  return sendSession(res, user);
});

// 2b. Continue with Google. Google has verified the email, so an existing account with that
// email signs in. A new person gets a sign-up ticket and is asked for their phone number.
authRouter.post('/google', limiter('login', 10), async (req, res) => {
  const role = requireRole(req.body?.role);
  const g = await verifyGoogleIdToken(req.body?.idToken);
  const user = await findUserByEmail(g.email);

  if (!user) {
    return res.json({ needsSignup: true, signupToken: makeSignupTicket(g), fullName: g.name, email: g.email });
  }
  if (user.role !== role) {
    throw forbidden('wrong_role',
      `This is a ${ROLE_NAME[user.role]} account. Choose "${ROLE_NAME[user.role]}" above to log in.`);
  }
  if (user.verification_status !== 'verified') {
    if (config.otpEnabled) {
      throw forbidden('account_not_verified', 'Your phone number is not verified yet. Verify it to finish creating your account.');
    }
    await authDb.query(
      "UPDATE users SET verification_status = 'verified', verified_at = UTC_TIMESTAMP() WHERE id = ?",
      [user.id]
    );
  }
  if (!user.google_sub) {
    // First Google sign-in to an account made with a password. Nobody checked that email when the
    // account was made, so whoever made it may not own the mailbox: Google has now proved who
    // does. Their password is replaced and every phone signed in is signed out, so a stranger who
    // registered this email first loses access. From now on this account signs in with Google.
    const newHash = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), config.bcryptRounds);
    await withTransaction(authDb, async (conn) => {
      await conn.query('UPDATE users SET google_sub = ?, password_hash = ? WHERE id = ? AND google_sub IS NULL',
        [g.sub, newHash, user.id]);
      await conn.query('UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [user.id]);
    });
  } else if (user.google_sub !== g.sub) {
    throw forbidden('google_account_mismatch', 'This email is linked to a different Google account.');
  }
  return sendSession(res, user);
});

// 2c. New Google user: the ticket from /google plus a phone number (and the name to show).
// The account has no password of its own; "Forgot password" can set one later.
authRouter.post('/google/signup', limiter('otp-send', 5), async (req, res) => {
  const g = readSignupTicket(req.body?.signupToken);
  const role = requireRole(req.body?.role);
  const name = requireName(req.body?.fullName || g.name);
  const phoneE164 = requirePhone(req.body?.phone);
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), config.bcryptRounds);
  // Google already proved who this is, so the account is ready at once (no SMS code): the phone
  // number is saved and the person goes straight in. They are asked for it only this once.
  await createUser({ name, phoneE164, emailLc: g.email, passwordHash, role, googleSub: g.sub, verifiedNow: true });
  const user = await findUserByEmail(g.email);
  return sendSession(res, user, 201);
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  await revokeSession(req.auth.sessionId);
  res.json({ loggedOut: true });
});

// Change password: needs the current password. Every other phone signed in to this account is
// signed out; this one stays signed in. A wrong current password is a 400, not a 401, so the
// app does not treat it as a lost session.
authRouter.post('/password', requireAuth, limiter('password', 10), async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  const [rows] = await authDb.query('SELECT password_hash FROM users WHERE id = ?', [req.auth.userId]);
  const hash = rows[0]?.password_hash;
  const ok = hash && typeof currentPassword === 'string' && await bcrypt.compare(currentPassword, hash);
  if (!ok) throw badRequest('wrong_password', 'Your current password is incorrect.');
  requireNewPassword(newPassword, confirmPassword);
  if (await bcrypt.compare(newPassword, hash)) {
    throw badRequest('same_password', 'Choose a new password that is different from the current one.');
  }

  const newHash = await bcrypt.hash(newPassword, config.bcryptRounds);
  await withTransaction(authDb, async (conn) => {
    await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.auth.userId]);
    await conn.query(
      'UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND id <> ? AND revoked_at IS NULL',
      [req.auth.userId, req.auth.sessionId]
    );
  });
  res.json({ changed: true });
});

// Forgot password, step 1: email a reset code to the account's email address, which proves
// the person can read that mailbox. Works whether or not sign-up SMS codes are switched on.
authRouter.post('/password/forgot', limiter('otp-send', 5), async (req, res) => {
  const email = requireEmail(req.body?.email);
  const user = await findUserByEmail(email);
  if (!user) throw notFound('not_registered', 'No account found for this email. Check the spelling or create an account.');
  const { expiresInSeconds } = await issueOtp({ purpose: 'password_reset', userId: user.id, email: user.email });
  res.json({ email: user.email, expiresInSeconds });
});

// Forgot password, step 2: the emailed code and a new password. Every phone signed in to the
// account is signed out, so the person has to log in again with the new password.
authRouter.post('/password/reset', limiter('otp-verify', 20), async (req, res) => {
  const email = requireEmail(req.body?.email);
  const code = requireOtp(req.body?.otp);
  const { newPassword, confirmPassword } = req.body || {};
  requireNewPassword(newPassword, confirmPassword);
  const user = await findUserByEmail(email);
  if (!user) throw badRequest('otp_not_found', 'This code is no longer valid. Request a new code.');
  await verifyOtp({ purpose: 'password_reset', userId: user.id, email: user.email, code });

  const newHash = await bcrypt.hash(newPassword, config.bcryptRounds);
  await withTransaction(authDb, async (conn) => {
    await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);
    await conn.query('UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [user.id]);
  });
  res.json({ reset: true });
});

// Who is logged in, and which client (if any) this session has verified.
authRouter.get('/me', requireAuth, async (req, res) => {
  let client = null;
  const row = req.auth.clientId ? await findClientById(req.auth.clientId) : null;
  if (row) client = { id: row.id, name: row.name, phoneMasked: maskPhone(row.phone) };
  res.json({ user: req.auth.user, client });
});
