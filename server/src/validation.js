import { config } from './config.js';
import { badRequest } from './errors.js';

// Normalises a phone number to E.164 (+<country><number>).
// Numbers without a country code get DEFAULT_COUNTRY_CODE (e.g. 98765 43210 -> +919876543210).
export function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!s.startsWith('+')) {
    s = s.replace(/^0+/, '');
    const cc = config.defaultCountryCode.slice(1);
    // "919876543210": the country code typed without the "+".
    if (cc === '91' && /^91[6-9]\d{9}$/.test(s)) s = s.slice(2);
    s = `${config.defaultCountryCode}${s}`;
  }
  if (s.startsWith('+910')) s = `+91${s.slice(4)}`; // "+91 098765 43210"
  // Indian mobile numbers: exactly 10 digits starting 6-9.
  if (s.startsWith('+91')) return /^\+91[6-9]\d{9}$/.test(s) ? s : null;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

export function requirePhone(value, field = 'phone') {
  const phone = normalizePhone(value);
  if (!phone) throw badRequest('invalid_phone', 'Enter a valid phone number.');
  return phone;
}

export function requireEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest('invalid_email', 'Enter a valid email address.');
  }
  return email;
}

export function requireName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 120) throw badRequest('invalid_name', 'Enter your full name.');
  return name;
}

export function requireNewPassword(password, confirmPassword) {
  if (typeof password !== 'string' || password.length < 8) {
    throw badRequest('weak_password', 'Password must be at least 8 characters.');
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    // bcrypt only uses the first 72 bytes: longer ones (Hindi letters are 3 bytes each) would be cut silently.
    throw badRequest('weak_password', 'Password is too long. Use at most 72 characters (Hindi, Telugu and other non-English letters count as 3).');
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw badRequest('weak_password', 'Password must contain at least one letter and one number.');
  }
  if (password !== confirmPassword) {
    throw badRequest('password_mismatch', 'Passwords do not match.');
  }
  return password;
}

export function requireOtp(value) {
  const code = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{6}$/.test(code)) throw badRequest('invalid_otp_format', 'Enter the 6-digit code.');
  return code;
}

// Account type: 'nurse' (opens any client by phone) or 'client' (a parent, own records only).
export const ROLES = ['nurse', 'client'];
export function requireRole(value) {
  if (value === undefined || value === null || value === '') return 'nurse';
  if (!ROLES.includes(value)) throw badRequest('invalid_role', 'Choose Parent or Nurse.');
  return value;
}

// Masks a phone number for display: +91******3210
export function maskPhone(phone) {
  return phone.length > 6 ? `${phone.slice(0, 3)}${'*'.repeat(phone.length - 7)}${phone.slice(-4)}` : phone;
}

// Masks an email for display: ma********@gmail.com
export function maskEmail(email) {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(3, local.length - 2))}@${domain}`;
}
