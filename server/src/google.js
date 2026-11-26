import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { config } from './config.js';
import { ApiError, badRequest } from './errors.js';

const client = new OAuth2Client();

/**
 * Checks a Google ID token from the app (signature, expiry and that it was issued to one of our
 * client IDs) and returns the Google account: { sub, email, name }. Only accounts whose email
 * Google has verified are accepted.
 */
async function googleVerify(idToken) {
  if (!config.google.clientIds.length) {
    throw new ApiError(503, 'google_not_configured', 'Google sign-in is not set up yet. Please use your email and password.');
  }
  if (typeof idToken !== 'string' || !idToken || idToken.length > 8192) {
    throw badRequest('invalid_google_token', 'Google sign-in failed. Please try again.');
  }
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: config.google.clientIds });
    payload = ticket.getPayload();
  } catch (_) {
    throw badRequest('invalid_google_token', 'Google sign-in failed. Please try again.');
  }
  return payload;
}

let verify = googleVerify;
// The automated tests replace Google's check, since they cannot get real Google tokens.
export function setGoogleVerifierForTests(fn) {
  verify = fn || googleVerify;
}

export async function verifyGoogleIdToken(idToken) {
  const p = await verify(idToken);
  if (!p?.email || p.email_verified !== true) {
    throw badRequest('google_email_unverified', "This Google account's email address is not verified.");
  }
  const email = p.email.trim().toLowerCase();
  return { sub: String(p.sub), email, name: (p.name || email.split('@')[0]).trim().slice(0, 120) };
}

// ---- Sign-up ticket -----------------------------------------------------------------------
// A new Google user still needs to give a phone number. The verified Google account travels to
// that step in a short-lived, signed ticket, so it cannot be forged or changed by the app.
const TICKET_MINUTES = 15;
const sign = (data) => crypto.createHmac('sha256', config.otpSecret).update(`google-signup:${data}`).digest('base64url');

export function makeSignupTicket({ sub, email, name }) {
  const data = Buffer.from(JSON.stringify({ sub, email, name, exp: Date.now() + TICKET_MINUTES * 60000 })).toString('base64url');
  return `${data}.${sign(data)}`;
}

export function readSignupTicket(ticket) {
  const expired = badRequest('google_signup_expired', 'Your Google sign-in has expired. Tap "Continue with Google" again.');
  if (typeof ticket !== 'string' || ticket.length > 4096) throw expired;
  const [data, sig] = ticket.split('.');
  if (!data || !sig) throw expired;
  const want = Buffer.from(sign(data));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) throw expired;
  let body;
  try {
    body = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch (_) {
    throw expired;
  }
  if (!body?.email || !body?.sub || !(body.exp > Date.now())) throw expired;
  return body;
}
