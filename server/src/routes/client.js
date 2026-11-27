import { Router } from 'express';
import { authDb, clientsDb } from '../db.js';
import { issueOtp, verifyOtp } from '../otp.js';
import { requireAuth, requireNurse, setSessionClient, hasClientAccess, grantClientAccess, markClientOpened } from '../sessions.js';
import { ApiError, notFound, forbidden, conflict, badRequest } from '../errors.js';
import { config } from '../config.js';
import { requirePhone, requireOtp, requireEmail, maskPhone, maskEmail } from '../validation.js';
import { limiter } from '../rateLimit.js';

// Clients are shared by all nurses: one nurse serves many clients, so a client is opened by
// its phone number alone and is not tied to the nurse who created it.
export const clientRouter = Router();
// Only nurses look up, create or switch clients; a client account is fixed to its own records.
clientRouter.use(requireAuth, requireNurse);

function requireClientName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 120) throw badRequest('invalid_client_name', "Enter the client's name.");
  return name;
}

async function findClient(phone) {
  const [rows] = await clientsDb.query('SELECT id, name, phone, user_id, email FROM clients WHERE phone = ?', [phone]);
  if (!rows[0]) throw notFound('client_not_found', 'No client is registered with this phone number.');
  return rows[0];
}

const publicClient = (c) => ({ id: c.id, name: c.name, phoneMasked: maskPhone(c.phone) });

// Where a family's access code is emailed: the parent's own account email when they have signed
// up (Google or a password, so it is theirs), otherwise the email confirmed for this family.
async function familyEmail(client) {
  const [rows] = await authDb.query(
    `SELECT email FROM users WHERE role = 'client' AND verification_status = 'verified' AND (id = ? OR phone = ?)
      ORDER BY id = ? DESC LIMIT 1`,
    [client.user_id ?? 0, client.phone, client.user_id ?? 0]
  );
  return rows[0]?.email || client.email || null;
}

// Opens the client for this session, or first sends the family a code (by email or SMS).
// `givenEmail`: the parent's email typed by the nurse, used only when the family has no email and
// no baby records yet (the nurse could type their own email, so it must never open real records);
// it is saved once the code is entered.
async function openOrSendCode(req, res, client, status = 200, givenEmail = null) {
  const channel = config.clientCodeChannel;
  // Off, or this nurse already entered this family's code and the access is still active.
  if (channel === 'off' || await hasClientAccess(req.auth.userId, client.id)) {
    if (channel !== 'off') await markClientOpened(req.auth.userId, client.id);
    await setSessionClient(req.auth.sessionId, client.id);
    return res.status(status).json({ otpRequired: false, client: publicClient(client) });
  }
  if (channel === 'sms') {
    const { expiresInSeconds } = await issueOtp({
      purpose: 'client_access', userId: req.auth.userId, clientId: client.id, phone: client.phone,
    });
    return res.status(status).json({ otpRequired: true, sentTo: 'phone', phoneMasked: maskPhone(client.phone), expiresInSeconds });
  }
  let email = await familyEmail(client);
  if (!email) {
    const [babies] = await clientsDb.query('SELECT 1 FROM babies WHERE client_id = ? LIMIT 1', [client.id]);
    if (babies.length) {
      throw conflict('family_email_missing',
        'This family has no email on file. Ask the parent to sign up in the Cradlewell app, or write to care@cradlewell.com.');
    }
    if (!givenEmail) throw conflict('email_needed', "This family has no email yet. Enter the parent's email to send them a code.");
    email = givenEmail;
  }
  const { expiresInSeconds } = await issueOtp({
    purpose: 'client_access', userId: req.auth.userId, clientId: client.id, phone: client.phone, email,
  });
  res.status(status).json({ otpRequired: true, sentTo: 'email', emailMasked: maskEmail(email), expiresInSeconds });
}

const optionalEmail = (v) => (v === undefined || v === null || v === '' ? null : requireEmail(v));

// 3a. An existing client: look it up by phone number and open its records.
clientRouter.post('/request-otp', limiter('client-lookup', 30), async (req, res) => {
  const client = await findClient(requirePhone(req.body?.phone));
  await openOrSendCode(req, res, client, 200, optionalEmail(req.body?.email));
});

// 3a'. A new client: no client has this phone number yet, so create it with the name given.
clientRouter.post('/', limiter('client-create', 20), async (req, res) => {
  const phone = requirePhone(req.body?.phone);
  const name = requireClientName(req.body?.name);
  const email = optionalEmail(req.body?.email);
  if (config.clientCodeChannel === 'email' && !email) {
    throw badRequest('email_needed', "Enter the parent's email. We'll send them a code to confirm.");
  }
  let result;
  try {
    [result] = await clientsDb.query('INSERT INTO clients (name, phone) VALUES (?, ?) RETURNING id', [name, phone]);
  } catch (err) {
    // Registered by someone else in the meantime: never overwrite an existing client.
    if (err.code === '23505') {
      throw conflict('client_exists', 'A client with this phone number already exists. Go back and enter the number again.');
    }
    throw err;
  }
  await openOrSendCode(req, res, { id: result.insertId, name, phone, user_id: null, email: null }, 201, email);
});

// 3b. With OTP on: verify the client's code, then open the client's records.
clientRouter.post('/verify-otp', limiter('otp-verify', 20), async (req, res) => {
  if (config.clientCodeChannel === 'off') throw new ApiError(410, 'otp_disabled', 'Verification codes are switched off.');
  const phone = requirePhone(req.body?.phone);
  const code = requireOtp(req.body?.otp);
  const client = await findClient(phone);
  // The code is checked against where it was sent (this family's phone, or an email address).
  const [sent] = await authDb.query(
    `SELECT phone AS sent_to FROM otp_codes
      WHERE user_id = ? AND purpose = 'client_access' AND client_id = ? AND consumed_at IS NULL
      ORDER BY id DESC LIMIT 1`,
    [req.auth.userId, client.id]
  );
  if (!sent[0]) throw badRequest('otp_not_found', 'This code is no longer valid. Request a new code.');
  const to = sent[0].sent_to;
  const otp = to.includes('@')
    ? await verifyOtp({ purpose: 'client_access', userId: req.auth.userId, email: to, code })
    : await verifyOtp({ purpose: 'client_access', userId: req.auth.userId, phone, code });
  if (Number(otp.client_id) !== Number(client.id)) {
    throw forbidden('client_mismatch', 'This code was issued for a different client. Request a new code.');
  }
  // Use that email for the next codes (never trusted for ownership: the nurse typed it).
  if (to.includes('@') && !client.email) {
    await clientsDb.query('UPDATE clients SET email = ? WHERE id = ? AND email IS NULL', [to, client.id]);
  }
  await grantClientAccess(req.auth.userId, client.id);
  await setSessionClient(req.auth.sessionId, client.id);
  res.json({ client: publicClient(client) });
});

// The 10 families this nurse most recently opened (verified before), newest first. Only these are
// listed or searchable, so a nurse never sees other families' names. They open without a code.
// A family stays in the list for 30 days after this nurse last tracked something for its babies
// (the last entry this nurse logged), or after the nurse first verified it if nothing is logged
// yet. Care that ended on 30 Oct drops off the list on 29 Nov; the number still opens it.
const RECENT_FAMILY_DAYS = 30;

clientRouter.get('/mine', async (req, res) => {
  const [rows] = await clientsDb.query(
    `SELECT id, name, phone, last_tracked,
            GREATEST(COALESCE(last_tracked, granted_at), granted_at) AS last_activity
       FROM (
         SELECT c.id, c.name, c.phone, a.granted_at,
                (SELECT MAX(r.updated_at) FROM monitoring_records r JOIN babies b ON b.id = r.baby_id
                  WHERE b.client_id = c.id AND r.updated_by = a.user_id) AS last_tracked
           FROM client_access a JOIN clients c ON c.id = a.client_id
          WHERE a.user_id = ? AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at > now())
       ) f
     WHERE GREATEST(COALESCE(last_tracked, granted_at), granted_at) > now() - make_interval(days => ?)
     ORDER BY last_activity DESC
     LIMIT 10`,
    [req.auth.userId, RECENT_FAMILY_DAYS]
  );
  res.json({
    clients: rows.map((c) => ({
      id: c.id, name: c.name, phone: c.phone, phoneMasked: maskPhone(c.phone),
      lastTracked: c.last_tracked, codeNeeded: false,
    })),
  });
});

// Leaves the current client without logging out (to switch to another client).
clientRouter.post('/leave', async (req, res) => {
  await setSessionClient(req.auth.sessionId, null);
  res.json({ left: true });
});
