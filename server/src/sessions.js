import crypto from 'node:crypto';
import { authDb, clientsDb } from './db.js';
import { config } from './config.js';
import { unauthorized, forbidden } from './errors.js';

// Session tokens are 256-bit random values; only their SHA-256 is stored, so a database
// leak does not reveal usable tokens.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// clientId opens that client in the new session at once (used for client accounts).
export async function createSession(userId, clientId = null) {
  const token = crypto.randomBytes(32).toString('base64url');
  await authDb.query(
    `INSERT INTO sessions (user_id, token_hash, client_id, client_verified_at, expires_at)
     VALUES (?, ?, ?, ?, now() + make_interval(days => ?))`,
    [userId, hashToken(token), clientId, clientId == null ? null : new Date(), config.sessionTtlDays]
  );
  return token;
}

export async function revokeSession(sessionId) {
  await authDb.query('UPDATE sessions SET revoked_at = now() WHERE id = ? AND revoked_at IS NULL', [sessionId]);
}

export async function setSessionClient(sessionId, clientId) {
  await authDb.query(
    'UPDATE sessions SET client_id = ?, client_verified_at = ? WHERE id = ?',
    [clientId, clientId == null ? null : new Date(), sessionId]
  );
}

export async function findClientById(clientId) {
  const [rows] = await clientsDb.query('SELECT id, name, phone FROM clients WHERE id = ?', [clientId]);
  return rows[0] || null;
}

// Middleware: requires a valid, unexpired, unrevoked bearer token.
export async function requireAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(header);
  if (!match) return next(unauthorized('not_logged_in', 'Please log in.'));

  const [rows] = await authDb.query(
    `SELECT s.id, s.user_id, s.client_id, u.full_name, u.email, u.phone, u.role, u.verification_status, u.google_sub
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [hashToken(match[1])]
  );
  const s = rows[0];
  if (!s || s.verification_status !== 'verified') {
    return next(unauthorized('session_expired', 'Your session has ended. Please log in again.'));
  }
  authDb.query('UPDATE sessions SET last_used_at = now() WHERE id = ?', [s.id]).catch(() => {});

  req.auth = {
    sessionId: s.id,
    userId: s.user_id,
    clientId: s.client_id,
    role: s.role,
    user: { id: s.user_id, fullName: s.full_name, email: s.email, phone: s.phone, role: s.role, google: !!s.google_sub },
  };
  next();
}

// Middleware: actions only nurses may take (look up, create or switch clients).
export function requireNurse(req, _res, next) {
  if (req.auth.role !== 'nurse') {
    return next(forbidden('nurse_only', 'Client accounts can only open their own records.'));
  }
  next();
}

// A client (parent) account's own entry in the clients table, matched by the account's phone
// number. A client a nurse already created with that number is linked to the account, so the
// parent sees the records the nurse logged; otherwise a new client is created.
export const FAMILY_NEEDS_CHECK = 'A nurse has already registered a family with your phone number. To open it, tap "Continue with Google" with the email Cradlewell has for your family, or write to care@cradlewell.com.';
// Only an email the admin entered for a family is trusted to hand it over: one a nurse typed could
// be the nurse's own.
const TRUSTED_EMAIL = 'CASE WHEN email_trusted THEN email END AS email';

// The parent proved this phone number with an SMS code: a family a nurse registered on it
// (and no parent owns yet) becomes theirs.
export async function linkFamilyByProvenPhone(userId, phone) {
  await clientsDb.query('UPDATE clients SET user_id = ? WHERE phone = ? AND user_id IS NULL', [userId, phone]);
}

// A family a nurse registered on this number that no parent owns yet (null if none).
export async function unclaimedFamily(phone) {
  const [rows] = await clientsDb.query(`SELECT id, ${TRUSTED_EMAIL} FROM clients WHERE phone = ? AND user_id IS NULL`, [phone]);
  return rows[0] || null;
}

export async function openOwnClient(user) {
  const [rows] = await clientsDb.query(`SELECT id, name, phone, user_id, ${TRUSTED_EMAIL} FROM clients WHERE phone = ?`, [user.phone]);
  if (rows[0]) {
    const c = rows[0];
    if (Number(c.user_id) === Number(user.id)) return c;
    // A nurse registered this family before the parent signed up. Typing the phone number proves
    // nothing (sign-up codes may be off), so the family is handed over only to someone who
    // proves it is theirs: Google has confirmed they own the email the admin entered for it.
    // (A phone proven by SMS is linked in linkFamilyByProvenPhone instead.)
    const sameEmail = c.email && String(c.email).toLowerCase() === String(user.email).toLowerCase();
    if (c.user_id == null && user.google_sub && sameEmail) {
      await clientsDb.query('UPDATE clients SET user_id = ? WHERE id = ? AND user_id IS NULL', [user.id, c.id]);
      return c;
    }
    throw forbidden('family_needs_check', FAMILY_NEEDS_CHECK);
  }
  try {
    const [res] = await clientsDb.query(
      'INSERT INTO clients (name, phone, user_id) VALUES (?, ?, ?) RETURNING id',
      [user.full_name, user.phone, user.id]
    );
    return { id: res.insertId, name: user.full_name, phone: user.phone };
  } catch (err) {
    // Created by a nurse at the same moment: check that one like any other existing family.
    if (err.code !== '23505') throw err;
    return openOwnClient(user);
  }
}

// ---- Nurse access to a family -------------------------------------------------------------
// A nurse enters a family's code once; after that the family opens without a code (on any phone
// the nurse logs in on) until the access expires or is revoked. Parents never need it.
const codesOn = () => config.clientCodeChannel !== 'off';
const ACTIVE = '(a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at > now()))';
const REMEMBERED = `(${ACTIVE} AND a.opened_at > now() - make_interval(days => ?))`;

export async function hasClientAccess(userId, clientId) {
  const [rows] = await clientsDb.query(
    `SELECT 1 FROM client_access a WHERE a.user_id = ? AND a.client_id = ? AND ${ACTIVE}`,
    [userId, clientId]
  );
  return rows.length > 0;
}

// Called when the family's code was entered: starts (or renews) this nurse's access.
export async function grantClientAccess(userId, clientId) {
  const days = config.clientAccessDays;
  await clientsDb.query(
    `INSERT INTO client_access (user_id, client_id, granted_at, expires_at, opened_at)
     VALUES (?, ?, now(), ?, now())
     ON CONFLICT (user_id, client_id) DO UPDATE SET granted_at = EXCLUDED.granted_at, expires_at = EXCLUDED.expires_at,
                             opened_at = EXCLUDED.opened_at, revoked_at = NULL`,
    [userId, clientId, days > 0 ? new Date(Date.now() + days * 86400000) : null]
  );
}

// The nurse entered this family's number again: the 30 days of opening by itself start again.
export async function markClientOpened(userId, clientId) {
  await clientsDb.query('UPDATE client_access SET opened_at = now() WHERE user_id = ? AND client_id = ?', [userId, clientId]);
}

// True while the family should open by itself for this nurse (number entered in the last 30 days).
export async function isClientRemembered(userId, clientId) {
  if (!codesOn()) return true;
  const [rows] = await clientsDb.query(
    `SELECT 1 FROM client_access a WHERE a.user_id = ? AND a.client_id = ? AND ${REMEMBERED}`,
    [userId, clientId, config.clientRememberDays]
  );
  return rows.length > 0;
}

// The family a nurse last opened, while it is still remembered: opened again at login.
export async function rememberedClient(userId) {
  if (!codesOn()) return null;
  const [rows] = await clientsDb.query(
    `SELECT c.id, c.name, c.phone FROM client_access a JOIN clients c ON c.id = a.client_id
      WHERE a.user_id = ? AND ${REMEMBERED} ORDER BY a.opened_at DESC LIMIT 1`,
    [userId, config.clientRememberDays]
  );
  return rows[0] || null;
}

// A nurse working in a family's records counts as a visit, once per nurse, family and day (India
// time). Remembered in memory so only the first request of the day writes.
const visitSeen = new Set();
export const indiaDate = (ms = Date.now()) => new Date(ms + 330 * 60000).toISOString().slice(0, 10);
function recordVisit(userId, clientId) {
  const day = indiaDate();
  const key = `${userId}:${clientId}:${day}`;
  if (visitSeen.has(key)) return;
  if (visitSeen.size > 5000) visitSeen.clear();
  visitSeen.add(key);
  clientsDb.query('INSERT INTO client_visits (user_id, client_id, visit_date) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [userId, clientId, day])
    .catch(() => visitSeen.delete(key));
}

// Middleware: requires a client opened in this session (by its phone number) that still exists,
// and, for a nurse while codes are on, an access that has not expired or been revoked.
export async function requireClient(req, _res, next) {
  const { clientId, sessionId, userId, role } = req.auth;
  if (!clientId) return next(forbidden('client_not_verified', "Enter the client's phone number first."));
  if (!(await findClientById(clientId))) {
    await setSessionClient(sessionId, null);
    return next(forbidden('client_not_found', 'This client no longer exists.'));
  }
  if (role === 'nurse' && codesOn() && !(await hasClientAccess(userId, clientId))) {
    await setSessionClient(sessionId, null);
    return next(forbidden('client_access_ended',
      "Your access to this family has ended. Enter their phone number to send the parent a new code."));
  }
  if (role === 'nurse') recordVisit(userId, clientId);
  next();
}
