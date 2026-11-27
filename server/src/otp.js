import crypto from 'node:crypto';
import { authDb, withTransaction } from './db.js';
import { config } from './config.js';
import { sendSms } from './sms.js';
import { sendEmail } from './email.js';
import { badRequest, tooMany } from './errors.js';

// Codes are never stored: only an HMAC keyed with OTP_SECRET, bound to purpose and to where
// the code was sent (phone or email), so a leaked database row cannot be brute-forced offline
// or replayed elsewhere.
function hashCode(purpose, phone, code) {
  return crypto.createHmac('sha256', config.otpSecret).update(`${purpose}:${phone}:${code}`).digest('hex');
}

function sameHash(a, b) {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const MESSAGES = {
  registration: (code) => `Your Cradlewell Bloom verification code is ${code}. It expires in 5 minutes. Do not share it.`,
  client_access: (code) => `Cradlewell Bloom: ${code} is the code to give your caregiver access to your baby's records. It expires in 5 minutes. Only share it if you asked for this.`,
};

// Codes sent by email.
const EMAILS = {
  client_access: (code) => ({
    subject: `${code} is your Cradlewell access code`,
    text: `Your nurse asked to open your baby's records in the Cradlewell app.

Your code is ${code}. It expires in 5 minutes.

Share it with your nurse only if you asked them to open your records. If you did not, ignore this email: nothing opens without the code.

Cradlewell`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1B1F2E">
  <h2 style="color:#5B4BB7;margin:0 0 12px">Your access code</h2>
  <p>Your nurse asked to open your baby's records in the Cradlewell app. Give them this code:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0;color:#1B1F2E">${code}</p>
  <p>It expires in 5 minutes.</p>
  <p style="color:#5A6690;font-size:13px">Share it only if you asked your nurse to open your records. If you did not, ignore this email: nothing opens without the code.</p>
  <p style="color:#5A6690;font-size:13px">Cradlewell</p>
</div>`,
  }),
  password_reset: (code) => ({
    subject: `${code} is your Cradlewell Bloom password reset code`,
    text: `Your Cradlewell Bloom password reset code is ${code}.\n\nIt expires in 5 minutes. Enter it in the app to choose a new password.\n\nIf you did not ask to reset your password, you can ignore this email: your password stays the same.\n\nCradlewell Bloom · care@cradlewell.com`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1B1F2E">
  <h2 style="color:#5B4BB7;margin:0 0 12px">Reset your password</h2>
  <p>Use this code in the Cradlewell Bloom app to choose a new password:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0;color:#1B1F2E">${code}</p>
  <p>It expires in 5 minutes.</p>
  <p style="color:#5A6690;font-size:13px">If you did not ask to reset your password, you can ignore this email: your password stays the same.</p>
  <p style="color:#5A6690;font-size:13px">Cradlewell Bloom · care@cradlewell.com</p>
</div>`,
  }),
};

/**
 * Creates a new code, supersedes any earlier unused code for the same user and purpose,
 * and sends it: by email when `email` is given, otherwise by SMS to `phone`.
 */
export async function issueOtp({ purpose, userId, clientId = null, phone, email }) {
  const to = email || phone;
  const [recent] = await authDb.query(
    `SELECT TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP()) AS age
       FROM otp_codes WHERE user_id = ? AND purpose = ? AND phone = ?
      ORDER BY id DESC LIMIT 1`,
    [userId, purpose, to]
  );
  const cooldown = config.otpResendCooldownSeconds;
  if (recent.length && recent[0].age < cooldown) {
    const wait = cooldown - recent[0].age;
    throw tooMany('otp_cooldown', `Please wait ${wait} second${wait === 1 ? '' : 's'} before requesting another code.`);
  }

  // At most OTP_DAILY_LIMIT codes of one kind to the same email (or phone) in 24 hours, whoever
  // asks: protects the inbox and the sending quota. Counted per kind, so spamming one kind (e.g.
  // password reset) cannot block another (e.g. a nurse's access code).
  const limit = config.otpDailyLimit;
  if (limit > 0) {
    const [sent] = await authDb.query(
      `SELECT created_at, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), created_at + INTERVAL 1 DAY) AS frees_in
         FROM otp_codes WHERE phone = ? AND purpose = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 1 DAY
        ORDER BY id DESC LIMIT ?`,
      [to, purpose, limit]
    );
    if (sent.length >= limit) {
      // The oldest of the last `limit` codes leaves the 24-hour window first.
      const hours = Math.max(1, Math.ceil(Number(sent[sent.length - 1].frees_in) / 3600));
      const where = email ? 'this email address' : 'this phone number';
      throw tooMany('otp_daily_limit',
        `Only ${limit} codes can be sent to ${where} in a day. Please try again in ${hours} hour${hours === 1 ? '' : 's'}, or use the last code that was sent.`);
    }
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const otpId = await withTransaction(authDb, async (conn) => {
    await conn.query(
      `UPDATE otp_codes SET consumed_at = UTC_TIMESTAMP()
        WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL`,
      [userId, purpose]
    );
    const [res] = await conn.query(
      `INSERT INTO otp_codes (purpose, user_id, client_id, phone, code_hash, expires_at)
       VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP() + INTERVAL ? SECOND)`,
      [purpose, userId, clientId, to, hashCode(purpose, to, code), config.otpTtlSeconds]
    );
    return res.insertId;
  });

  try {
    if (email) await sendEmail(email, EMAILS[purpose](code));
    else await sendSms(phone, MESSAGES[purpose](code));
  } catch (err) {
    await authDb.query('UPDATE otp_codes SET consumed_at = UTC_TIMESTAMP() WHERE id = ?', [otpId]);
    throw err;
  }
  return { expiresInSeconds: config.otpTtlSeconds };
}

/**
 * Checks a code. On success the code is consumed (single use) and its row returned.
 * Wrong codes count against a limit; expired, used, or locked codes are rejected.
 */
export async function verifyOtp({ purpose, userId, phone, email, code }) {
  const to = email || phone;
  const outcome = await withTransaction(authDb, async (conn) => {
    const [rows] = await conn.query(
      `SELECT id, client_id, code_hash, attempts, (expires_at <= UTC_TIMESTAMP()) AS expired
         FROM otp_codes
        WHERE user_id = ? AND purpose = ? AND phone = ? AND consumed_at IS NULL
        ORDER BY id DESC LIMIT 1
        FOR UPDATE`,
      [userId, purpose, to]
    );
    const otp = rows[0];
    if (!otp) return { error: 'otp_not_found' };

    if (otp.expired) {
      await conn.query('UPDATE otp_codes SET consumed_at = UTC_TIMESTAMP() WHERE id = ?', [otp.id]);
      return { error: 'otp_expired' };
    }

    if (!sameHash(otp.code_hash, hashCode(purpose, to, code))) {
      const attempts = otp.attempts + 1;
      const locked = attempts >= config.otpMaxAttempts;
      await conn.query(
        `UPDATE otp_codes SET attempts = ?, consumed_at = ${locked ? 'UTC_TIMESTAMP()' : 'NULL'} WHERE id = ?`,
        [attempts, otp.id]
      );
      return { error: locked ? 'otp_locked' : 'otp_incorrect', left: config.otpMaxAttempts - attempts };
    }

    // Conditional update makes the "use once" guarantee hold even under concurrent requests.
    const [res] = await conn.query(
      'UPDATE otp_codes SET consumed_at = UTC_TIMESTAMP() WHERE id = ? AND consumed_at IS NULL',
      [otp.id]
    );
    if (res.affectedRows !== 1) return { error: 'otp_not_found' };
    return { otp };
  });

  // Thrown after the transaction commits, so failed attempts are recorded.
  switch (outcome.error) {
    case undefined:
      return outcome.otp;
    case 'otp_not_found':
      throw badRequest('otp_not_found', 'This code is no longer valid. Request a new code.');
    case 'otp_expired':
      throw badRequest('otp_expired', 'This code has expired. Request a new code.');
    case 'otp_locked':
      throw tooMany('otp_locked', 'Too many incorrect attempts. Request a new code.');
    default:
      throw badRequest(
        'otp_incorrect',
        `Incorrect code. ${outcome.left} attempt${outcome.left === 1 ? '' : 's'} left.`
      );
  }
}
