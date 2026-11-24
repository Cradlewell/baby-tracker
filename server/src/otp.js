import crypto from 'node:crypto';
import { authDb, withTransaction } from './db.js';
import { config } from './config.js';
import { sendSms } from './sms.js';
import { badRequest, tooMany } from './errors.js';

// Codes are never stored: only an HMAC keyed with OTP_SECRET, bound to purpose and phone,
// so a leaked database row cannot be brute-forced offline or replayed elsewhere.
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

/**
 * Creates a new code, supersedes any earlier unused code for the same user and purpose,
 * and texts it to `phone`.
 */
export async function issueOtp({ purpose, userId, clientId = null, phone }) {
  const [recent] = await authDb.query(
    `SELECT TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP()) AS age
       FROM otp_codes WHERE user_id = ? AND purpose = ? AND phone = ?
      ORDER BY id DESC LIMIT 1`,
    [userId, purpose, phone]
  );
  const cooldown = config.otpResendCooldownSeconds;
  if (recent.length && recent[0].age < cooldown) {
    const wait = cooldown - recent[0].age;
    throw tooMany('otp_cooldown', `Please wait ${wait} second${wait === 1 ? '' : 's'} before requesting another code.`);
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
      [purpose, userId, clientId, phone, hashCode(purpose, phone, code), config.otpTtlSeconds]
    );
    return res.insertId;
  });

  try {
    await sendSms(phone, MESSAGES[purpose](code));
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
export async function verifyOtp({ purpose, userId, phone, code }) {
  const outcome = await withTransaction(authDb, async (conn) => {
    const [rows] = await conn.query(
      `SELECT id, client_id, code_hash, attempts, (expires_at <= UTC_TIMESTAMP()) AS expired
         FROM otp_codes
        WHERE user_id = ? AND purpose = ? AND phone = ? AND consumed_at IS NULL
        ORDER BY id DESC LIMIT 1
        FOR UPDATE`,
      [userId, purpose, phone]
    );
    const otp = rows[0];
    if (!otp) return { error: 'otp_not_found' };

    if (otp.expired) {
      await conn.query('UPDATE otp_codes SET consumed_at = UTC_TIMESTAMP() WHERE id = ?', [otp.id]);
      return { error: 'otp_expired' };
    }

    if (!sameHash(otp.code_hash, hashCode(purpose, phone, code))) {
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
