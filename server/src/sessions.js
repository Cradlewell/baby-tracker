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
     VALUES (?, ?, ?, IF(? IS NULL, NULL, UTC_TIMESTAMP()), UTC_TIMESTAMP() + INTERVAL ? DAY)`,
    [userId, hashToken(token), clientId, clientId, config.sessionTtlDays]
  );
  return token;
}

export async function revokeSession(sessionId) {
  await authDb.query('UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE id = ? AND revoked_at IS NULL', [sessionId]);
}

export async function setSessionClient(sessionId, clientId) {
  await authDb.query(
    'UPDATE sessions SET client_id = ?, client_verified_at = IF(? IS NULL, NULL, UTC_TIMESTAMP()) WHERE id = ?',
    [clientId, clientId, sessionId]
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
    `SELECT s.id, s.user_id, s.client_id, u.full_name, u.email, u.phone, u.role, u.verification_status
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP()`,
    [hashToken(match[1])]
  );
  const s = rows[0];
  if (!s || s.verification_status !== 'verified') {
    return next(unauthorized('session_expired', 'Your session has ended. Please log in again.'));
  }
  authDb.query('UPDATE sessions SET last_used_at = UTC_TIMESTAMP() WHERE id = ?', [s.id]).catch(() => {});

  req.auth = {
    sessionId: s.id,
    userId: s.user_id,
    clientId: s.client_id,
    role: s.role,
    user: { id: s.user_id, fullName: s.full_name, email: s.email, phone: s.phone, role: s.role },
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
export async function openOwnClient(user) {
  const [rows] = await clientsDb.query('SELECT id, name, phone, user_id FROM clients WHERE phone = ?', [user.phone]);
  if (rows[0]) {
    if (rows[0].user_id == null) {
      await clientsDb.query('UPDATE clients SET user_id = ? WHERE id = ? AND user_id IS NULL', [user.id, rows[0].id]);
    }
    return rows[0];
  }
  try {
    const [res] = await clientsDb.query(
      'INSERT INTO clients (name, phone, user_id) VALUES (?, ?, ?)',
      [user.full_name, user.phone, user.id]
    );
    return { id: res.insertId, name: user.full_name, phone: user.phone };
  } catch (err) {
    // Created by a nurse at the same moment: use that one.
    if (err.code !== 'ER_DUP_ENTRY') throw err;
    const [again] = await clientsDb.query('SELECT id, name, phone FROM clients WHERE phone = ?', [user.phone]);
    return again[0];
  }
}

// Middleware: requires a client opened in this session (by its phone number) that still exists.
// Clients are not tied to a nurse, so there is no per-user authorization check.
export async function requireClient(req, _res, next) {
  const { clientId, sessionId } = req.auth;
  if (!clientId) return next(forbidden('client_not_verified', "Enter the client's phone number first."));
  if (!(await findClientById(clientId))) {
    await setSessionClient(sessionId, null);
    return next(forbidden('client_not_found', 'This client no longer exists.'));
  }
  next();
}
