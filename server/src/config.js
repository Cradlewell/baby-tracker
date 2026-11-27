import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name} (see server/.env.example)`);
  return value;
}

// TRUST_PROXY=1 means "one proxy in front" (a number for Express); "true"/"false" and
// names like "loopback" are passed through as Express expects them.
function parseTrustProxy(v) {
  const s = (v || '').trim();
  if (!s || s === 'false' || s === '0') return false;
  if (s === 'true') return true;
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

const otpSecret = required('OTP_SECRET');
if (otpSecret.length < 32) throw new Error('OTP_SECRET must be at least 32 characters long');

const smsProvider = (process.env.SMS_PROVIDER || 'console').toLowerCase();
if (env === 'production' && process.env.OTP_ENABLED === 'true' && smsProvider !== 'twilio') {
  // Console/memory providers print or keep codes in memory: never acceptable for real users.
  throw new Error('SMS_PROVIDER must be "twilio" when NODE_ENV=production and OTP_ENABLED=true');
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

  authDb: {
    host: process.env.AUTH_DB_HOST || '127.0.0.1',
    port: Number(process.env.AUTH_DB_PORT || 3306),
    user: required('AUTH_DB_USER'),
    password: required('AUTH_DB_PASSWORD'),
    database: process.env.AUTH_DB_NAME || 'cradlewell_auth',
  },
  clientsDb: {
    host: process.env.CLIENTS_DB_HOST || '127.0.0.1',
    port: Number(process.env.CLIENTS_DB_PORT || 3306),
    user: required('CLIENTS_DB_USER'),
    password: required('CLIENTS_DB_PASSWORD'),
    database: process.env.CLIENTS_DB_NAME || 'cradlewell_clients',
  },

  otpSecret,
  // When false, sign-up activates the account immediately and a client opens as soon as its
  // phone number is found (no codes are sent).
  otpEnabled: process.env.OTP_ENABLED === 'true',
  clientCodeChannel,
  // Accounts that may open the admin dashboard (/admin), by email, comma separated.
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  // A nurse who entered a family's code once never needs it again for that family (unless it is
  // revoked). Set to a number of days to make that access expire. 0 = never.
  clientAccessDays: Number(process.env.CLIENT_ACCESS_DAYS || 0),
  // For this many days after a nurse entered a family's number, opening the app or logging in
  // goes straight to that family; after that the number is asked again (no code if served before).
  clientRememberDays: Number(process.env.CLIENT_REMEMBER_DAYS || 30),
  otpTtlSeconds: 5 * 60,
  otpMaxAttempts: 5,
  otpResendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 30),
  // Codes sent to one email or phone in 24 hours (all kinds together). 0 = no limit.
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
    from: process.env.EMAIL_FROM || 'Cradlewell Bloom <care@cradlewell.com>',
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
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      from: process.env.TWILIO_FROM_NUMBER,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
    },
  },
};
