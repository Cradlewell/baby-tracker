// End-to-end test of the full flow against the real MySQL databases configured in server/.env:
// Registration -> OTP -> Login -> Client phone -> Client OTP -> monitoring data.
// SMS go to an in-memory outbox; every user and client the test creates is deleted afterwards.
process.env.OTP_ENABLED = 'true';
process.env.SMS_PROVIDER = 'memory';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '0';
process.env.NODE_ENV = 'test';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { createApp } = await import('../src/app.js');
const { authDb, clientsDb, closePools } = await import('../src/db.js');
const { memoryOutbox } = await import('../src/sms.js');

let server;
let base;
const createdUserIds = [];
const createdClientIds = [];

const rnd = () => String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const phone = () => `+9198${rnd().slice(0, 8)}`;
const uniq = rnd();

async function call(method, path, { body, token } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

function lastCodeFor(to) {
  const msg = [...memoryOutbox].reverse().find((m) => m.to === to);
  assert.ok(msg, `expected an SMS to ${to}`);
  return /\b(\d{6})\b/.exec(msg.body)[1];
}

const wrong = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

async function registerAndVerify({ email, phone: ph, name = 'Test User', password = 'Passw0rd!' }) {
  const r = await call('POST', '/auth/register', {
    body: { fullName: name, phone: ph, email, password, confirmPassword: password },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const v = await call('POST', '/auth/register/verify', { body: { email, otp: lastCodeFor(ph) } });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  const [rows] = await authDb.query('SELECT id FROM users WHERE email = ?', [email]);
  createdUserIds.push(rows[0].id);
  return rows[0].id;
}

async function login(email, password = 'Passw0rd!') {
  const r = await call('POST', '/auth/login', { body: { email, password } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
}

async function createClient(name, ph) {
  const [res] = await clientsDb.query('INSERT INTO clients (name, phone) VALUES (?, ?)', [name, ph]);
  createdClientIds.push(res.insertId);
  return res.insertId;
}

async function verifyClient(token, ph) {
  const r = await call('POST', '/client/request-otp', { token, body: { phone: ph } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const v = await call('POST', '/client/verify-otp', { token, body: { phone: ph, otp: lastCodeFor(ph) } });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return v.body.client;
}

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (createdClientIds.length) await clientsDb.query('DELETE FROM clients WHERE id IN (?)', [createdClientIds]);
  const [leftovers] = await authDb.query('SELECT id FROM users WHERE email LIKE ?', [`%+e2e${uniq}@example.com`]);
  const ids = [...new Set([...createdUserIds, ...leftovers.map((r) => r.id)])];
  if (ids.length) await authDb.query('DELETE FROM users WHERE id IN (?)', [ids]);
  server.close();
  await closePools();
});

const emailA = `alice+e2e${uniq}@example.com`;
const emailB = `bob+e2e${uniq}@example.com`;
const phoneA = phone();
const phoneB = phone();
const clientPhoneX = phone();
const clientPhoneY = phone();

test('registration validates input', async () => {
  const good = { fullName: 'Alice Test', phone: phoneA, email: emailA, password: 'Passw0rd!', confirmPassword: 'Passw0rd!' };
  const cases = [
    [{ ...good, confirmPassword: 'Different1' }, 'password_mismatch'],
    [{ ...good, password: 'short1', confirmPassword: 'short1' }, 'weak_password'],
    [{ ...good, phone: '12' }, 'invalid_phone'],
    [{ ...good, email: 'not-an-email' }, 'invalid_email'],
    [{ ...good, fullName: '' }, 'invalid_name'],
  ];
  for (const [body, code] of cases) {
    const r = await call('POST', '/auth/register', { body });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, code);
  }
});

test('registration -> OTP -> account activated; passwords and OTPs are stored hashed', async () => {
  const password = 'Passw0rd!';
  const r = await call('POST', '/auth/register', {
    body: { fullName: 'Alice Test', phone: phoneA, email: emailA, password, confirmPassword: password },
  });
  assert.equal(r.status, 201);
  assert.match(r.body.phoneMasked, /\*+\d{4}$/);
  assert.equal(r.body.expiresInSeconds, 300);
  const code = lastCodeFor(phoneA);

  const [[user]] = await authDb.query('SELECT * FROM users WHERE email = ?', [emailA]);
  createdUserIds.push(user.id);
  assert.equal(user.verification_status, 'pending');
  assert.notEqual(user.password_hash, password);
  assert.match(user.password_hash, /^\$2[aby]\$/);
  const [[otpRow]] = await authDb.query('SELECT code_hash FROM otp_codes WHERE user_id = ?', [user.id]);
  assert.ok(!otpRow.code_hash.includes(code), 'OTP must not be stored in plain text');

  // Not verified yet: login refused.
  const early = await call('POST', '/auth/login', { body: { email: emailA, password } });
  assert.equal(early.status, 403);
  assert.equal(early.body.error.code, 'account_not_verified');

  const bad = await call('POST', '/auth/register/verify', { body: { email: emailA, otp: wrong(code) } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'otp_incorrect');
  assert.match(bad.body.error.message, /4 attempts left/);

  const ok = await call('POST', '/auth/register/verify', { body: { email: emailA, otp: code } });
  assert.equal(ok.status, 200);
  const [[after]] = await authDb.query('SELECT verification_status FROM users WHERE id = ?', [user.id]);
  assert.equal(after.verification_status, 'verified');

  const again = await call('POST', '/auth/register/verify', { body: { email: emailA, otp: code } });
  assert.equal(again.status, 409);

  const dup = await call('POST', '/auth/register', {
    body: { fullName: 'Someone', phone: phone(), email: emailA, password, confirmPassword: password },
  });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'email_taken');
});

test('expired OTPs are rejected and a resent code works', async () => {
  const password = 'Passw0rd!';
  await call('POST', '/auth/register', {
    body: { fullName: 'Bob Test', phone: phoneB, email: emailB, password, confirmPassword: password },
  });
  const code = lastCodeFor(phoneB);
  await authDb.query(
    `UPDATE otp_codes o JOIN users u ON u.id = o.user_id
        SET o.expires_at = UTC_TIMESTAMP() - INTERVAL 1 SECOND WHERE u.email = ?`,
    [emailB]
  );
  const expired = await call('POST', '/auth/register/verify', { body: { email: emailB, otp: code } });
  assert.equal(expired.status, 400);
  assert.equal(expired.body.error.code, 'otp_expired');

  const resend = await call('POST', '/auth/register/resend', { body: { email: emailB } });
  assert.equal(resend.status, 200);
  const fresh = lastCodeFor(phoneB);
  const ok = await call('POST', '/auth/register/verify', { body: { email: emailB, otp: fresh } });
  assert.equal(ok.status, 200);
  const [[u]] = await authDb.query('SELECT id FROM users WHERE email = ?', [emailB]);
  createdUserIds.push(u.id);
});

test('an OTP expires five minutes after it is issued', async () => {
  const [[row]] = await authDb.query(
    `SELECT TIMESTAMPDIFF(SECOND, o.created_at, o.expires_at) AS ttl
       FROM otp_codes o JOIN users u ON u.id = o.user_id WHERE u.email = ? ORDER BY o.id DESC LIMIT 1`,
    [emailB]
  );
  assert.equal(row.ttl, 300);
});

test('login rejects invalid credentials', async () => {
  const wrongPw = await call('POST', '/auth/login', { body: { email: emailA, password: 'Wrong1234' } });
  assert.equal(wrongPw.status, 401);
  assert.equal(wrongPw.body.error.code, 'invalid_credentials');
  const unknown = await call('POST', '/auth/login', { body: { email: `nobody${uniq}@example.com`, password: 'Passw0rd!' } });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error.message, wrongPw.body.error.message, 'same message for unknown email');
});

test('full flow: login -> client phone -> client OTP -> view, add and edit records', async () => {
  await createClient('Client X', clientPhoneX);
  await createClient('Client Y', clientPhoneY);

  const token = await login(emailA);

  // Logged in, but no client verified yet.
  const me = await call('GET', '/auth/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, emailA);
  assert.equal(me.body.client, null);
  assert.equal((await call('GET', '/data/babies', { token })).body.error.code, 'client_not_verified');
  assert.equal((await call('GET', '/data/babies')).status, 401);

  // Unregistered client phone number.
  const unreg = await call('POST', '/client/request-otp', { token, body: { phone: phone() } });
  assert.equal(unreg.status, 404);
  assert.equal(unreg.body.error.code, 'client_not_found');

  // Client OTP: wrong code, then right code, then the same code again (single use).
  const req1 = await call('POST', '/client/request-otp', { token, body: { phone: clientPhoneX } });
  assert.equal(req1.status, 200);
  const code = lastCodeFor(clientPhoneX);
  const bad = await call('POST', '/client/verify-otp', { token, body: { phone: clientPhoneX, otp: wrong(code) } });
  assert.equal(bad.body.error.code, 'otp_incorrect');
  const ok = await call('POST', '/client/verify-otp', { token, body: { phone: clientPhoneX, otp: code } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.client.name, 'Client X');
  const reuse = await call('POST', '/client/verify-otp', { token, body: { phone: clientPhoneX, otp: code } });
  assert.equal(reuse.status, 400);
  assert.equal(reuse.body.error.code, 'otp_not_found');
  assert.equal((await call('GET', '/auth/me', { token })).body.client.name, 'Client X');

  // Babies: add and read.
  const baby = { id: `baby${uniq}`, name: 'Aria', dob: '01/02/2026', gender: 'girl', createdAt: new Date().toISOString() };
  let r = await call('PATCH', '/data/babies', { token, body: { upsert: [baby], delete: [], order: [baby.id] } });
  assert.equal(r.status, 200);
  r = await call('GET', '/data/babies', { token });
  assert.deepEqual(r.body.items, [baby]);

  // Records: add two feeds, edit one, add a newer one on top, delete one; order is preserved.
  const path = `/data/babies/${baby.id}/records/feeding`;
  const f1 = { id: `f1${uniq}`, babyId: baby.id, type: 'bottle', amount: 90 };
  const f2 = { id: `f2${uniq}`, babyId: baby.id, type: 'breast', leftSecs: 300 };
  r = await call('PATCH', path, { token, body: { upsert: [f2, f1], delete: [], order: [f2.id, f1.id] } });
  assert.equal(r.status, 200);
  assert.deepEqual((await call('GET', path, { token })).body.items, [f2, f1]);

  const f1Edited = { ...f1, amount: 120 };
  const f3 = { id: `f3${uniq}`, babyId: baby.id, type: 'bottle', amount: 60 };
  r = await call('PATCH', path, { token, body: { upsert: [f3, f1Edited], delete: [f2.id], order: [f3.id, f1.id] } });
  assert.equal(r.status, 200);
  assert.deepEqual((await call('GET', path, { token })).body.items, [f3, f1Edited]);

  assert.equal((await call('GET', `/data/babies/${baby.id}/records/unknown`, { token })).status, 404);

  // A session opened for a different client cannot see or overwrite this client's data through it.
  const tokenB = await login(emailB);
  await verifyClient(tokenB, clientPhoneY);
  assert.deepEqual((await call('GET', '/data/babies', { token: tokenB })).body.items, []);
  const peek = await call('GET', path, { token: tokenB });
  assert.equal(peek.status, 404);
  const steal = await call('PATCH', '/data/babies', { token: tokenB, body: { upsert: [{ ...baby, name: 'Hacked' }], order: [baby.id] } });
  assert.equal(steal.status, 409);
  const write = await call('PATCH', path, { token: tokenB, body: { upsert: [{ id: 'x1', a: 1 }] } });
  assert.equal(write.status, 404);
  await call('DELETE', '/data/babies', { token: tokenB });
  assert.equal((await call('GET', '/data/babies', { token })).body.items.length, 1, "B's clear-all did not touch X");

  // Deleting a baby deletes its records too.
  const temp = { id: `tmp${uniq}`, name: 'Temp' };
  await call('PATCH', '/data/babies', { token, body: { upsert: [temp], order: [baby.id, temp.id] } });
  await call('PATCH', `/data/babies/${temp.id}/records/sleep`, { token, body: { upsert: [{ id: `s${uniq}` }] } });
  await call('PATCH', '/data/babies', { token, body: { delete: [temp.id], order: [baby.id] } });
  const [orphans] = await clientsDb.query('SELECT 1 FROM monitoring_records WHERE baby_id = ?', [temp.id]);
  assert.equal(orphans.length, 0);

  // Clients are shared: another nurse (B) can open client X and sees the same records.
  await verifyClient(tokenB, clientPhoneX);
  assert.deepEqual((await call('GET', path, { token: tokenB })).body.items, [f3, f1Edited]);

  // Logout ends the session.
  assert.equal((await call('POST', '/auth/logout', { token })).status, 200);
  const afterLogout = await call('GET', '/auth/me', { token });
  assert.equal(afterLogout.status, 401);
  assert.equal(afterLogout.body.error.code, 'session_expired');
});

test('five wrong client codes lock the code', async () => {
  const token = await login(emailA);
  await call('POST', '/client/request-otp', { token, body: { phone: clientPhoneX } });
  const code = lastCodeFor(clientPhoneX);
  let last;
  for (let i = 0; i < 5; i++) {
    last = await call('POST', '/client/verify-otp', { token, body: { phone: clientPhoneX, otp: wrong(code) } });
  }
  assert.equal(last.status, 429);
  assert.equal(last.body.error.code, 'otp_locked');
  const tooLate = await call('POST', '/client/verify-otp', { token, body: { phone: clientPhoneX, otp: code } });
  assert.equal(tooLate.body.error.code, 'otp_not_found', 'correct code no longer works after lockout');
});

test('session tokens are stored hashed', async () => {
  const token = await login(emailA);
  const [rows] = await authDb.query('SELECT token_hash FROM sessions WHERE token_hash = ?', [token]);
  assert.equal(rows.length, 0);
});
