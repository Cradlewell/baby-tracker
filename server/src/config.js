import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name} (see server/.env.example)`);
  return value;
}

const env = process.env.NODE_ENV || 'development';

const otpSecret = required('OTP_SECRET');
if (otpSecret.length < 32) throw new Error('OTP_SECRET must be at least 32 characters long');

const smsProvider = (process.env.SMS_PROVIDER || 'console').toLowerCase();
if (env === 'production' && process.env.OTP_ENABLED === 'true' && smsProvider !== 'twilio') {
  // Console/memory providers print or keep codes in memory: never acceptable for real users.
  throw new Error('SMS_PROVIDER must be "twilio" when NODE_ENV=production and OTP_ENABLED=true');
}

export const config = {
  env,
  port: Number(process.env.PORT || 4000),
  trustProxy: process.env.TRUST_PROXY || false,
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
  otpTtlSeconds: 5 * 60,
  otpMaxAttempts: 5,
  otpResendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 30),
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '+91',
  rateLimit: process.env.DISABLE_RATE_LIMIT !== 'true',

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
