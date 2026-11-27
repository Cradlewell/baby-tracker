// The flow with one-time codes switched off (OTP_ENABLED=false):
// Registration -> Login -> Client phone -> monitoring data, with no codes at any step.
process.env.OTP_ENABLED = 'false';
process.env.CLIENT_CODE_CHANNEL = 'off';
process.env.SMS_PROVIDER = 'memory';
process.env.EMAIL_PROVIDER = 'memory';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.NURSE_APPROVAL = 'false';
process.env.NODE_ENV = 'test';
process.env.DB_SCHEMA = 'app_test'; // never the app's own data

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { createApp } = await import('../src/app.js');
const { authDb, clientsDb, closePools } = await import('../src/db.js');
const { memoryOutbox } = await import('../src/sms.js');

let server;
let base;
const uniq = String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const email = `carol+nootp${uniq}@example.com`;
const otherEmail = `dave+nootp${uniq}@example.com`;
const phone = (n) => `+9197${uniq.slice(0, 7)}${n}`;
const clientIds = [];
const extraEmails = [];

async function call(method, path, { body, token } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (clientIds.length) await clientsDb.query('DELETE FROM clients WHERE id IN (?)', [clientIds]);
  // Every family on this run's phone numbers, including ones a parent's sign-up created.
  await clientsDb.query('DELETE FROM clients WHERE phone LIKE ?', [`+9197${uniq.slice(0, 7)}%`]);
  await authDb.query('DELETE FROM users WHERE email IN (?)', [[email, otherEmail, `erin+nootp${uniq}@example.com`, ...extraEmails]]);
  server.close();
  await closePools();
});

test('register -> login -> client phone -> records, with no codes', async () => {
  const password = 'Passw0rd!';
  const reg = await call('POST', '/auth/register', {
    body: { fullName: 'Carol Test', phone: phone(1), email, password, confirmPassword: password },
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.otpRequired, false);
  assert.equal(memoryOutbox.length, 0, 'no SMS sent');

  const [[user]] = await authDb.query('SELECT id, verification_status, password_hash FROM users WHERE email = ?', [email]);
  assert.equal(user.verification_status, 'verified');
  assert.match(user.password_hash, /^\$2[aby]\$/);

  // Validation and wrong passwords still behave the same.
  const mismatch = await call('POST', '/auth/register', {
    body: { fullName: 'X Y', phone: phone(2), email: `x${email}`, password, confirmPassword: 'nope12345' },
  });
  assert.equal(mismatch.body.error.code, 'password_mismatch');
  assert.equal((await call('POST', '/auth/login', { body: { email, password: 'Wrong1234' } })).status, 401);

  const login = await call('POST', '/auth/login', { body: { email, password } });
  assert.equal(login.status, 200);
  const { token } = login.body;

  // An unregistered client number is refused; no client is open yet.
  assert.equal((await call('POST', '/client/request-otp', { token, body: { phone: phone(9) } })).body.error.code, 'client_not_found');
  assert.equal((await call('GET', '/data/babies', { token })).body.error.code, 'client_not_verified');

  // Any existing client opens immediately: clients are not tied to a nurse.
  const [other] = await clientsDb.query('INSERT INTO clients (name, phone) VALUES (?, ?) RETURNING id', ['Other Client', phone(4)]);
  clientIds.push(other.insertId);
  const [mine] = await clientsDb.query('INSERT INTO clients (name, phone) VALUES (?, ?) RETURNING id', ['My Client', phone(3)]);
  clientIds.push(mine.insertId);
  const open = await call('POST', '/client/request-otp', { token, body: { phone: phone(3) } });
  assert.equal(open.status, 200);
  assert.equal(open.body.otpRequired, false);
  assert.equal(open.body.client.name, 'My Client');
  assert.equal(memoryOutbox.length, 0, 'still no SMS sent');

  const baby = { id: `b${uniq}`, name: 'Noah' };
  assert.equal((await call('PATCH', '/data/babies', { token, body: { upsert: [baby], order: [baby.id] } })).status, 200);
  assert.deepEqual((await call('GET', '/data/babies', { token })).body.items, [baby]);

  // The code endpoints are switched off.
  assert.equal((await call('POST', '/client/verify-otp', { token, body: { phone: phone(3), otp: '123456' } })).status, 410);
  assert.equal((await call('POST', '/auth/register/resend', { body: { email } })).status, 410);

  assert.equal((await call('POST', '/auth/logout', { token })).status, 200);
  assert.equal((await call('GET', '/auth/me', { token })).status, 401);
});

test('an unknown client phone number becomes a new client the user can track', async () => {
  const password = 'Passw0rd!';
  const login = await call('POST', '/auth/login', { body: { email, password } });
  // The first test logged this user out; log in again.
  assert.equal(login.status, 200);
  const { token } = login.body;
  const newPhone = phone(6);

  assert.equal((await call('POST', '/client/request-otp', { token, body: { phone: newPhone } })).body.error.code, 'client_not_found');
  assert.equal((await call('POST', '/client', { token, body: { phone: newPhone, name: ' ' } })).body.error.code, 'invalid_client_name');

  const created = await call('POST', '/client', { token, body: { phone: newPhone, name: 'New Family' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.otpRequired, false);
  assert.equal(created.body.client.name, 'New Family');
  clientIds.push(created.body.client.id);

  // The new client is open: start tracking straight away.
  assert.deepEqual((await call('GET', '/data/babies', { token })).body.items, []);
  const baby = { id: `nb${uniq}`, name: 'Ira' };
  assert.equal((await call('PATCH', '/data/babies', { token, body: { upsert: [baby], order: [baby.id] } })).status, 200);
  assert.equal((await call('GET', '/auth/me', { token })).body.client.name, 'New Family');

  // An existing number can never be taken over by creating it again.
  const again = await call('POST', '/client', { token, body: { phone: newPhone, name: 'Impostor' } });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'client_exists');
  const taken = await call('POST', '/client', { token, body: { phone: phone(4), name: 'Impostor' } });
  assert.equal(taken.body.error.code, 'client_exists', 'an existing client is never overwritten');
  const [[c]] = await clientsDb.query('SELECT name FROM clients WHERE phone = ?', [phone(4)]);
  assert.equal(c.name, 'Other Client');
});

test('a client created by one nurse can be opened by another', async () => {
  const [[row]] = await clientsDb.query('SELECT id FROM clients WHERE phone = ?', [phone(6)]);
  assert.ok(row, 'client from the previous test exists');
  const password = 'Passw0rd!';
  await call('POST', '/auth/register', {
    body: { fullName: 'Erin Test', phone: phone(7), email: `erin+nootp${uniq}@example.com`, password, confirmPassword: password },
  });
  const { token } = (await call('POST', '/auth/login', { body: { email: `erin+nootp${uniq}@example.com`, password } })).body;
  const open = await call('POST', '/client/request-otp', { token, body: { phone: phone(6) } });
  assert.equal(open.status, 200);
  assert.equal(open.body.client.name, 'New Family');
  assert.deepEqual((await call('GET', '/data/babies', { token })).body.items, [{ id: `nb${uniq}`, name: 'Ira' }]);
});

test('a client (parent) account logs in straight to its own records', async () => {
  const password = 'Passw0rd!';
  const parentEmail = `parent+nootp${uniq}@example.com`;
  const parentPhone = phone(8);
  extraEmails.push(parentEmail);

  const reg = await call('POST', '/auth/register', {
    body: { fullName: 'Asha Parent', phone: parentPhone, email: parentEmail, password, confirmPassword: password, role: 'client' },
  });
  assert.equal(reg.status, 201);
  const [[u]] = await authDb.query('SELECT role FROM users WHERE email = ?', [parentEmail]);
  assert.equal(u.role, 'client');

  // Choosing the wrong account type is refused, with a message naming the right one.
  const wrong = await call('POST', '/auth/login', { body: { email: parentEmail, password, role: 'nurse' } });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.body.error.code, 'wrong_role');
  const wrongNurse = await call('POST', '/auth/login', { body: { email, password, role: 'client' } });
  assert.equal(wrongNurse.body.error.code, 'wrong_role');

  // Client login: own client created in the clients table and opened at once.
  const login = await call('POST', '/auth/login', { body: { email: parentEmail, password, role: 'client' } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'client');
  assert.equal(login.body.client.name, 'Asha Parent');
  clientIds.push(login.body.client.id);
  const [[row]] = await clientsDb.query('SELECT name, phone, user_id FROM clients WHERE id = ?', [login.body.client.id]);
  assert.equal(row.phone, parentPhone);
  assert.ok(row.user_id, 'client row is linked to the parent account');
  const { token } = login.body;
  assert.equal((await call('GET', '/auth/me', { token })).body.client.name, 'Asha Parent');
  assert.equal((await call('GET', '/data/babies', { token })).status, 200);

  // A client account cannot look up, create or switch to other clients.
  for (const [m, path, body] of [
    ['POST', '/client/request-otp', { phone: phone(4) }],
    ['POST', '/client', { phone: phone(9), name: 'Someone' }],
    ['POST', '/client/leave', {}],
  ]) {
    const r = await call(m, path, { token, body });
    assert.equal(r.status, 403, path);
    assert.equal(r.body.error.code, 'nurse_only');
  }

  // Logging in again reuses the same client row (no duplicate).
  const again = await call('POST', '/auth/login', { body: { email: parentEmail, password, role: 'client' } });
  assert.equal(again.body.client.id, login.body.client.id);
});

test("with codes off, nobody can take a nurse-registered family by signing up with its number", async () => {
  const password = 'Passw0rd!';
  const strangerEmail = `stranger+nootp${uniq}@example.com`;
  extraEmails.push(strangerEmail);
  // phone(6) is "New Family", registered by a nurse (no parent account yet), with baby Ira.
  const reg = await call('POST', '/auth/register', {
    body: { fullName: 'Stranger', phone: phone(6), email: strangerEmail, password, confirmPassword: password, role: 'client' },
  });
  assert.equal(reg.status, 403);
  assert.equal(reg.body.error.code, 'family_needs_check');
  const [none] = await authDb.query('SELECT id FROM users WHERE email = ?', [strangerEmail]);
  assert.equal(none.length, 0, 'no account made');
  const [[row]] = await clientsDb.query('SELECT user_id FROM clients WHERE phone = ?', [phone(6)]);
  assert.equal(row.user_id, null, 'family not handed over');
});

test('an account left unverified while codes were on is activated at login', async () => {
  const password = 'Passw0rd!';
  await authDb.query(
    `INSERT INTO users (full_name, phone, email, password_hash, verification_status)
     VALUES ('Dave Test', ?, ?, ?, 'pending')`,
    [phone(5), otherEmail, (await import('bcryptjs')).default.hashSync(password, 4)]
  );
  const login = await call('POST', '/auth/login', { body: { email: otherEmail, password } });
  assert.equal(login.status, 200);
  const [[u]] = await authDb.query('SELECT verification_status FROM users WHERE email = ?', [otherEmail]);
  assert.equal(u.verification_status, 'verified');
});

test('a password longer than bcrypt reads (72 bytes) is refused, not silently cut', async () => {
  const long = `a1${'न'.repeat(24)}`; // 26 letters, but 74 bytes
  const r = await call('POST', '/auth/register', {
    body: { fullName: 'Long Pass', phone: phone(2), email: `long+nootp${uniq}@example.com`, password: long, confirmPassword: long },
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'weak_password');
});
