import { Router } from 'express';
import { clientsDb } from '../db.js';
import { issueOtp, verifyOtp } from '../otp.js';
import { requireAuth, requireNurse, setSessionClient } from '../sessions.js';
import { ApiError, notFound, forbidden, conflict, badRequest } from '../errors.js';
import { config } from '../config.js';
import { requirePhone, requireOtp, maskPhone } from '../validation.js';
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
  const [rows] = await clientsDb.query('SELECT id, name, phone FROM clients WHERE phone = ?', [phone]);
  if (!rows[0]) throw notFound('client_not_found', 'No client is registered with this phone number.');
  return rows[0];
}

const publicClient = (c) => ({ id: c.id, name: c.name, phoneMasked: maskPhone(c.phone) });

// Opens the client for this session, or (with OTP on) texts the client a code first.
async function openOrSendCode(req, res, client, status = 200) {
  if (!config.otpEnabled) {
    await setSessionClient(req.auth.sessionId, client.id);
    return res.status(status).json({ otpRequired: false, client: publicClient(client) });
  }
  const { expiresInSeconds } = await issueOtp({
    purpose: 'client_access', userId: req.auth.userId, clientId: client.id, phone: client.phone,
  });
  res.status(status).json({ otpRequired: true, phoneMasked: maskPhone(client.phone), expiresInSeconds });
}

// 3a. An existing client: look it up by phone number and open its records.
clientRouter.post('/request-otp', limiter('client-lookup', 30), async (req, res) => {
  const client = await findClient(requirePhone(req.body?.phone));
  await openOrSendCode(req, res, client);
});

// 3a'. A new client: no client has this phone number yet, so create it with the name given.
clientRouter.post('/', limiter('client-create', 20), async (req, res) => {
  const phone = requirePhone(req.body?.phone);
  const name = requireClientName(req.body?.name);
  let result;
  try {
    [result] = await clientsDb.query('INSERT INTO clients (name, phone) VALUES (?, ?)', [name, phone]);
  } catch (err) {
    // Registered by someone else in the meantime: never overwrite an existing client.
    if (err.code === 'ER_DUP_ENTRY') {
      throw conflict('client_exists', 'A client with this phone number already exists. Go back and enter the number again.');
    }
    throw err;
  }
  await openOrSendCode(req, res, { id: result.insertId, name, phone }, 201);
});

// 3b. With OTP on: verify the client's code, then open the client's records.
clientRouter.post('/verify-otp', limiter('otp-verify', 20), async (req, res) => {
  if (!config.otpEnabled) throw new ApiError(410, 'otp_disabled', 'Verification codes are switched off.');
  const phone = requirePhone(req.body?.phone);
  const code = requireOtp(req.body?.otp);
  const client = await findClient(phone);
  const otp = await verifyOtp({ purpose: 'client_access', userId: req.auth.userId, phone, code });
  if (Number(otp.client_id) !== Number(client.id)) {
    throw forbidden('client_mismatch', 'This code was issued for a different client. Request a new code.');
  }
  await setSessionClient(req.auth.sessionId, client.id);
  res.json({ client: publicClient(client) });
});

// Leaves the current client without logging out (to switch to another client).
clientRouter.post('/leave', async (req, res) => {
  await setSessionClient(req.auth.sessionId, null);
  res.json({ left: true });
});
