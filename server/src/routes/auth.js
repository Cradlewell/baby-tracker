import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authDb, clientsDb, withTransaction } from '../db.js';
import { config } from '../config.js';
import { issueOtp, verifyOtp } from '../otp.js';
import {
  createSession, revokeSession, requireAuth, findClientById, openOwnClient, setSessionClient, isClientRemembered, rememberedClient,
  unclaimedFamily, linkFamilyByProvenPhone, FAMILY_NEEDS_CHECK,
} from '../sessions.js';
import { ApiError, badRequest, conflict, notFound, unauthorized, forbidden } from '../errors.js';
import {
  requireEmail, requireName, requirePhone, requireNewPassword, requireOtp, maskPhone, requireRole,
} from '../validation.js';
import { limiter } from '../rateLimit.js';
import crypto from 'node:crypto';
import { verifyGoogleIdToken, makeSignupTicket, readSignupTicket } from '../google.js';
import { removeExpiredRequests } from '../approval.js';

export const authRouter = Router();

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

async function findUserByEmail(email) {
  const [rows] = await authDb.query(
    'SELECT id, full_name, phone, email, password_hash, verification_status, role, google_sub, approval_status FROM users WHERE email = ?',
    [email]
  );
  return rows[0] || null;
}

const publicUser = (u) => ({ id: u.id, fullName: u.full_name, email: u.email, phone: u.phone, role: u.role, google: !!u.google_sub });
const publicClient = (c) => ({ id: c.id, name: c.name, phoneMasked: maskPhone(c.phone) });
const ROLE_NAME = { nurse: 'Nurse', client: 'Parent' };

// A nurse who signed up in the app waits for the admin's approval before logging in.
const needsApproval = (role) => role === 'nurse' && config.nurseApproval;
const PENDING_MESSAGE = "Your nurse account is waiting for approval by Cradlewell. We'll email you as soon as it's approved.";
function requireApproved(user) {
  if (user.role !== 'nurse') return;
  if (user.approval_status === 'pending') throw forbidden('approval_pending', PENDING_MESSAGE);
  if (user.approval_status === 'rejected') {
    throw forbidden('approval_rejected', 'This nurse account was not approved. For help, write to care@cradlewell.com.');
  }
}

// Creates an account, replacing unfinished sign-ups with the same email or phone. Without
// OTP the account is active at once; with OTP it waits for the phone code.
// Two sign-ups for the same email or phone at once (a double tap): one wins, the other replaced
// it or hit the same rows. Answer "try again" instead of a server error.
// PostgreSQL codes: unique violation, foreign key violation, deadlock, lock not available.
const RACE_ERRORS = new Set(['23505', '23503', '40P01', '55P03']);
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

// True when a nurse has already registered a family with this phone number and no parent account
// owns it yet: a parent signing up with this number would be given that family's records.
async function familyExists(phoneE164) {
  const [rows] = await clientsDb.query('SELECT id FROM clients WHERE phone = ?', [phoneE164]);
  return rows.length > 0;
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
      `INSERT INTO users (full_name, phone, email, password_hash, verification_status, verified_at, role, google_sub, approval_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [name, phoneE164, emailLc, passwordHash,
        verifiedNow ? 'verified' : 'pending', verifiedNow ? new Date() : null, role, googleSub,
        needsApproval(role) ? 'pending' : 'approved']
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
  // A nurse goes straight back to the family whose number they entered in the last 30 days.
  const last = await rememberedClient(user.id);
  const token = await createSession(user.id, last?.id ?? null);
  return res.status(status).json({ token, user: publicUser(user), client: last ? publicClient(last) : null });
}

// 1. Registration: creates a pending account and texts an OTP to the phone number.
authRouter.post('/register', limiter('otp-send', 5), async (req, res) => {
  const { fullName, phone, email, password, confirmPassword } = req.body || {};
  const role = requireRole(req.body?.role);
  const name = requireName(fullName);
  const phoneE164 = requirePhone(phone);
  const emailLc = requireEmail(email);
  requireNewPassword(password, confirmPassword);

  if (role === 'client' && !config.otpEnabled && await unclaimedFamily(phoneE164)) {
    throw forbidden('family_needs_check', FAMILY_NEEDS_CHECK);
  }
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  await removeExpiredRequests();
  const userId = await createUser({ name, phoneE164, emailLc, passwordHash, role });

  const approvalPending = needsApproval(role);
  if (!config.otpEnabled) {
    return res.status(201).json({ email: emailLc, otpRequired: false, approvalPending });
  }
  const { expiresInSeconds } = await signupRace(() => issueOtp({ purpose: 'registration', userId, phone: phoneE164 }));
  res.status(201).json({ email: emailLc, otpRequired: true, phoneMasked: maskPhone(phoneE164), expiresInSeconds, approvalPending });
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
    "UPDATE users SET verification_status = 'verified', verified_at = now() WHERE id = ?",
    [user.id]
  );
  if (user.role === 'client') await linkFamilyByProvenPhone(user.id, user.phone);
  res.json({ verified: true });
});

// 2. Login with email and password.
const LOGIN_LIMIT_MESSAGE = 'Too many login attempts. Please wait 15 minutes, or tap "Forgot password?" to set a new one.';

authRouter.post('/login', limiter('login', 10, 15, LOGIN_LIMIT_MESSAGE), async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const role = requireRole(req.body?.role);
  await removeExpiredRequests();
  const user = email ? await findUserByEmail(email) : null;

  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    // The same answer whether or not the email has an account, so strangers can't find accounts.
    const left = req.rateLimit?.remaining;
    const hint = left === undefined || left > 3 ? ''
      : left === 0 ? ' This was the last try: wait 15 minutes, or tap "Forgot password?".'
        : ` ${left} ${left === 1 ? 'try' : 'tries'} left before a 15-minute wait.`;
    throw unauthorized('invalid_credentials', `Incorrect email or password.${hint}`);
  }

  // Checked after the password, so the answer never reveals which kind an unknown email is.
  if (user.role === 'admin') {
    throw forbidden('admin_account', 'This is an admin account. Use the admin dashboard on the web.');
  }
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
      "UPDATE users SET verification_status = 'verified', verified_at = now() WHERE id = ?",
      [user.id]
    );
  }
  requireApproved(user);

  // A client (parent) goes straight to their own records: the session opens their own client.
  return sendSession(res, user);
});

// 2b. Continue with Google. Google has verified the email, so an existing account with that
// email signs in. A new person gets a sign-up ticket and is asked for their phone number.
authRouter.post('/google', limiter('login', 10), async (req, res) => {
  const role = requireRole(req.body?.role);
  const g = await verifyGoogleIdToken(req.body?.idToken);
  await removeExpiredRequests();
  const user = await findUserByEmail(g.email);

  // No account yet, or a Google sign-up that stopped at the SMS code: (re)start the phone step.
  // Unfinished sign-ups are replaced when the new one is made.
  if (!user || (user.verification_status !== 'verified' && user.google_sub === g.sub)) {
    return res.json({ needsSignup: true, signupToken: makeSignupTicket(g), fullName: g.name, email: g.email });
  }
  if (user.role === 'admin') {
    throw forbidden('admin_account', 'This is an admin account. Use the admin dashboard on the web.');
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
      "UPDATE users SET verification_status = 'verified', verified_at = now() WHERE id = ?",
      [user.id]
    );
  }
  requireApproved(user);
  if (!user.google_sub) {
    // First Google sign-in to an account made with a password. Nobody checked that email when the
    // account was made, so whoever made it may not own the mailbox: Google has now proved who
    // does. Their password is replaced and every phone signed in is signed out, so a stranger who
    // registered this email first loses access. From now on this account signs in with Google.
    const newHash = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), config.bcryptRounds);
    await withTransaction(authDb, async (conn) => {
      await conn.query('UPDATE users SET google_sub = ?, password_hash = ? WHERE id = ? AND google_sub IS NULL',
        [g.sub, newHash, user.id]);
      await conn.query('UPDATE sessions SET revoked_at = now() WHERE user_id = ? AND revoked_at IS NULL', [user.id]);
    });
    user.google_sub = g.sub;
  } else if (user.google_sub !== g.sub) {
    throw forbidden('google_account_mismatch', 'This email is linked to a different Google account.');
  }
  return sendSession(res, user);
});

// 2c. New Google user: the ticket from /google plus a phone number (and the name to show).
// Google proved the email, not the phone. A brand-new number goes straight in (asked only once).
// A number that already has a family's records (a nurse registered it) would hand those records
// to whoever typed it, so it must first be proven with an SMS code (2d).
authRouter.post('/google/signup', limiter('otp-send', 5), async (req, res) => {
  const g = readSignupTicket(req.body?.signupToken);
  const role = requireRole(req.body?.role);
  const name = requireName(req.body?.fullName || g.name);
  const phoneE164 = requirePhone(req.body?.phone);
  const fam = role === 'client' ? await unclaimedFamily(phoneE164) : null;
  const emailProven = !!fam?.email && String(fam.email).toLowerCase() === g.email;
  const needsProof = role === 'client' && !emailProven && await familyExists(phoneE164);
  if (needsProof && !config.otpEnabled) {
    throw forbidden('phone_needs_verification',
      FAMILY_NEEDS_CHECK);
  }
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), config.bcryptRounds);
  const userId = await createUser({ name, phoneE164, emailLc: g.email, passwordHash, role, googleSub: g.sub, verifiedNow: !needsProof });
  if (needsProof) {
    const { expiresInSeconds } = await signupRace(() => issueOtp({ purpose: 'registration', userId, phone: phoneE164 }));
    return res.json({ otpRequired: true, email: g.email, phoneMasked: maskPhone(phoneE164), expiresInSeconds });
  }
  const user = await findUserByEmail(g.email);
  if (user.approval_status === 'pending') {
    return res.status(201).json({ approvalPending: true, email: g.email, message: PENDING_MESSAGE });
  }
  return sendSession(res, user, 201);
});

// 2d. The SMS code for 2c: proves the phone, activates the account and signs in.
authRouter.post('/google/signup/verify', requireOtpEnabled, limiter('otp-verify', 20), async (req, res) => {
  const g = readSignupTicket(req.body?.signupToken);
  const code = requireOtp(req.body?.otp);
  const user = await findUserByEmail(g.email);
  if (!user || user.google_sub !== g.sub) {
    throw notFound('not_registered', 'No sign-up found. Tap "Continue with Google" again.');
  }
  if (user.verification_status === 'verified') {
    throw conflict('already_verified', 'This account is already verified. Tap "Continue with Google" to sign in.');
  }
  await verifyOtp({ purpose: 'registration', userId: user.id, phone: user.phone, code });
  await authDb.query(
    "UPDATE users SET verification_status = 'verified', verified_at = now() WHERE id = ?",
    [user.id]
  );
  if (user.role === 'client') await linkFamilyByProvenPhone(user.id, user.phone);
  return sendSession(res, { ...user, verification_status: 'verified' }, 201);
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
      'UPDATE sessions SET revoked_at = now() WHERE user_id = ? AND id <> ? AND revoked_at IS NULL',
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
    await conn.query('UPDATE sessions SET revoked_at = now() WHERE user_id = ? AND revoked_at IS NULL', [user.id]);
  });
  res.json({ reset: true });
});

// Delete account (Google Play requires it in the app). Needs the password, or, for an account
// that signs in with Google, only the typed confirmation. Deletes:
//   a parent: the account, their family record, every baby and every care record;
//   a nurse: the account and their access to families (the families' records stay theirs).
authRouter.post('/account/delete', requireAuth, limiter('password', 10), async (req, res) => {
  if (req.body?.confirm !== 'DELETE') throw badRequest('confirm_required', 'Type DELETE to confirm.');
  const [rows] = await authDb.query('SELECT id, phone, role, password_hash, google_sub FROM users WHERE id = ?', [req.auth.userId]);
  const user = rows[0];
  if (!user) throw unauthorized('session_expired', 'Your session has ended. Please log in again.');
  if (!user.google_sub) {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || !(await bcrypt.compare(password, user.password_hash))) {
      throw badRequest('wrong_password', 'Your password is incorrect.');
    }
  }

  if (user.role === 'client') {
    // Babies, records and nurses' access go with the family (ON DELETE CASCADE).
    await clientsDb.query('DELETE FROM clients WHERE user_id = ?', [user.id]);
  } else {
    await clientsDb.query('DELETE FROM client_access WHERE user_id = ?', [user.id]);
  }
  // Sessions and codes go with the account (ON DELETE CASCADE).
  await authDb.query('DELETE FROM users WHERE id = ?', [user.id]);
  res.json({ deleted: true });
});

// Who is logged in, and which client (if any) this session has verified.
authRouter.get('/me', requireAuth, async (req, res) => {
  let client = null;
  let row = req.auth.clientId ? await findClientById(req.auth.clientId) : null;
  // A nurse is asked for the number again 30 days after last entering it (or if access ended).
  if (row && req.auth.role === 'nurse' && !(await isClientRemembered(req.auth.userId, row.id))) {
    await setSessionClient(req.auth.sessionId, null);
    row = null;
  }
  if (row) client = { id: row.id, name: row.name, phoneMasked: maskPhone(row.phone) };
  res.json({ user: req.auth.user, client });
});
