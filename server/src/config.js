import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name} (see server/.env.example)`);
  return value;
}

// TRUST_PROXY=1 means "one proxy in front" (a number for Express); names like "loopback" are
// passed through as Express expects them.
function parseTrustProxy(v) {
  const s = (v || '').trim();
  if (!s || s === 'false' || s === '0') return false;
  // "true" believes any X-Forwarded-For a client sends, so every per-IP limit could be dodged.
  if (s === 'true') throw new Error('TRUST_PROXY=true is not allowed: set the number of proxies in front of the server, e.g. TRUST_PROXY=1');
  return /^\d+$/.test(s) ? Number(s) : s;
}

const env = process.env.NODE_ENV || 'development';

// How a nurse proves a family agreed before their records open: a code by 'email' (to the
// parent's email), by 'sms' (to the family's phone), or 'off' (opens at once).
const clientCodeChannel = (process.env.CLIENT_CODE_CHANNEL
  || (process.env.OTP_ENABLED === 'true' ? 'sms' : 'off')).trim().toLowerCase();
if (!['off', 'sms', 'email'].includes(clientCodeChannel)) {
  throw new Error('CLIENT_CODE_CHANNEL must be "email", "sms" or "off"');
}
if (env === 'production' && clientCodeChannel === 'off') {
  // "off" opens any family to any nurse without the parent's code: for local testing only.
  throw new Error('CLIENT_CODE_CHANNEL must be "email" or "sms" when NODE_ENV=production');
}

const otpSecret = required('OTP_SECRET');
if (otpSecret.length < 32) throw new Error('OTP_SECRET must be at least 32 characters long');

const smsProvider = (process.env.SMS_PROVIDER || 'console').toLowerCase();
if (env === 'production' && (process.env.OTP_ENABLED === 'true' || clientCodeChannel === 'sms')) {
  // There is no real SMS sender: codes would only be printed, never reach the phone.
  throw new Error('SMS codes are not available in production: set OTP_ENABLED=false and CLIENT_CODE_CHANNEL=email');
}

// Password reset codes always go by email, so real users need a real mailbox.
const emailProvider = (process.env.EMAIL_PROVIDER || 'console').toLowerCase();
if (env === 'production' && emailProvider !== 'smtp') {
  throw new Error('EMAIL_PROVIDER must be "smtp" when NODE_ENV=production');
}

export const config = {
  env,
  port: Number(process.env.PORT || 4000),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),

  // Supabase (PostgreSQL). The app's tables live in the schema DB_SCHEMA.
  databaseUrl: required('DATABASE_URL'),
  dbSchema: process.env.DB_SCHEMA || 'app',

  otpSecret,
  // When false, sign-up activates the account immediately and a client opens as soon as its
  // phone number is found (no codes are sent).
  otpEnabled: process.env.OTP_ENABLED === 'true',
  clientCodeChannel,
  // A nurse who entered a family's code once never needs it again for that family (unless it is
  // revoked). Set to a number of days to make that access expire. 0 = never.
  clientAccessDays: Number(process.env.CLIENT_ACCESS_DAYS || 0),
  // For this many days after a nurse entered a family's number, opening the app or logging in
  // goes straight to that family; after that the number is asked again (no code if served before).
  clientRememberDays: Number(process.env.CLIENT_REMEMBER_DAYS || 30),
  otpTtlSeconds: 5 * 60,
  otpMaxAttempts: 5,
  otpResendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 30),
  // Codes of one kind sent to one email or phone in 24 hours. 0 = no limit.
  otpDailyLimit: Number(process.env.OTP_DAILY_LIMIT ?? 4),
  // Nurses who sign up in the app can log in only after the admin approves them.
  nurseApproval: process.env.NURSE_APPROVAL !== 'false',
  // A nurse sign-up nobody approved or rejected within this many days is removed.
  approvalDays: Number(process.env.NURSE_APPROVAL_DAYS || 10),
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '+91',
  rateLimit: process.env.DISABLE_RATE_LIMIT !== 'true',

  // OAuth client IDs whose Google ID tokens are accepted (web, Android and iOS), comma-separated.
  google: {
    clientIds: (process.env.GOOGLE_CLIENT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  },

  email: {
    provider: emailProvider,
    from: process.env.EMAIL_FROM || 'Cradlewell Baby Tracker <care@cradlewell.com>',
    smtp: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      // Port 465 uses TLS from the start; 587 upgrades with STARTTLS.
      secure: (process.env.SMTP_SECURE ?? String(Number(process.env.SMTP_PORT || 465) === 465)) === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  },

  sms: {
    provider: smsProvider,
  },
};
