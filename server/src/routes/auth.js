import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authDb, withTransaction } from '../db.js';
import { config } from '../config.js';
import { issueOtp, verifyOtp } from '../otp.js';
import {
  createSession, revokeSession, requireAuth, findClientById, openOwnClient,
} from '../sessions.js';
import { ApiError, conflict, notFound, unauthorized, forbidden } from '../errors.js';
import {
  requireEmail, requireName, requirePhone, requireNewPassword, requireOtp, maskPhone, requireRole,
} from '../validation.js';
import { limiter } from '../rateLimit.js';

export const authRouter = Router();

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

async function findUserByEmail(email) {
  const [rows] = await authDb.query(
    'SELECT id, full_name, phone, email, password_hash, verification_status, role FROM users WHERE email = ?',
    [email]
  );
  return rows[0] || null;
}

const publicUser = (u) => ({ id: u.id, fullName: u.full_name, email: u.email, phone: u.phone, role: u.role });
const publicClient = (c) => ({ id: c.id, name: c.name, phoneMasked: maskPhone(c.phone) });
const ROLE_NAME = { nurse: 'Nurse', client: 'Client' };

// 1. Registration: creates a pending account and texts an OTP to the phone number.
authRouter.post('/register', limiter('otp-send', 5), async (req, res) => {
  const { fullName, phone, email, password, confirmPassword } = req.body || {};
  const role = requireRole(req.body?.role);
  const name = requireName(fullName);
  const phoneE164 = requirePhone(phone);
  const emailLc = requireEmail(email);
  requireNewPassword(password, confirmPassword);

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

  const userId = await withTransaction(authDb, async (conn) => {
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

    // Without OTP the account is active at once; with OTP it waits for the code.
    const [result] = await conn.query(
      `INSERT INTO users (full_name, phone, email, password_hash, verification_status, verified_at, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, phoneE164, emailLc, passwordHash,
        config.otpEnabled ? 'pending' : 'verified', config.otpEnabled ? null : new Date(), role]
    );
    return result.insertId;
  });

  if (!config.otpEnabled) {
    return res.status(201).json({ email: emailLc, otpRequired: false });
  }
  const { expiresInSeconds } = await issueOtp({ purpose: 'registration', userId, phone: phoneE164 });
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
  if (user.role === 'client') {
    const client = await openOwnClient(user);
    const token = await createSession(user.id, client.id);
    return res.json({ token, user: publicUser(user), client: publicClient(client) });
  }
  const token = await createSession(user.id);
  res.json({ token, user: publicUser(user), client: null });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  await revokeSession(req.auth.sessionId);
  res.json({ loggedOut: true });
});

// Who is logged in, and which client (if any) this session has verified.
authRouter.get('/me', requireAuth, async (req, res) => {
  let client = null;
  const row = req.auth.clientId ? await findClientById(req.auth.clientId) : null;
  if (row) client = { id: row.id, name: row.name, phoneMasked: maskPhone(row.phone) };
  res.json({ user: req.auth.user, client });
});
