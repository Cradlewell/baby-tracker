// End-to-end test of the full flow against the real MySQL databases configured in server/.env:
// Registration -> OTP -> Login -> Client phone -> Client OTP -> monitoring data.
// SMS go to an in-memory outbox; every user and client the test creates is deleted afterwards.
process.env.OTP_ENABLED = 'true';
process.env.SMS_PROVIDER = 'memory';
process.env.EMAIL_PROVIDER = 'memory';
process.env.GOOGLE_CLIENT_IDS = 'test-client.apps.googleusercontent.com';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '0';
process.env.NODE_ENV = 'test';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { createApp } = await import('../src/app.js');
const { authDb, clientsDb, closePools } = await import('../src/db.js');
const { memoryOutbox } = await import('../src/sms.js');
const { memoryMailbox } = await import('../src/email.js');
const { setGoogleVerifierForTests } = await import('../src/google.js');
const { badRequest } = await import('../src/errors.js');
const { normalizePhone } = await import('../src/validation.js');

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

  // A nurse can never delete a baby's data: not a baby, not all babies, not a whole record list.
  const temp = { id: `tmp${uniq}`, name: 'Temp' };
  await call('PATCH', '/data/babies', { token, body: { upsert: [temp], order: [baby.id, temp.id] } });
  await call('PATCH', `/data/babies/${temp.id}/records/sleep`, { token, body: { upsert: [{ id: `s${uniq}` }] } });
  const noDel = await call('PATCH', '/data/babies', { token, body: { delete: [temp.id], order: [baby.id] } });
  assert.equal(noDel.status, 403);
  assert.equal(noDel.body.error.code, 'nurse_cannot_delete');
  assert.equal((await call('DELETE', '/data/babies', { token })).status, 403);
  assert.equal((await call('DELETE', `/data/babies/${temp.id}/records/sleep`, { token })).status, 403);
  assert.equal((await call('GET', '/data/babies', { token })).body.items.length, 2, 'nothing was deleted');
  assert.equal((await call('GET', `/data/babies/${temp.id}/records/sleep`, { token })).body.items.length, 1);

  // Deleting a baby (as the family does) deletes its records too.
  await clientsDb.query('DELETE FROM babies WHERE id = ?', [temp.id]);
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

test('change password: needs the current one, signs out other phones, keeps this one', async () => {
  const email = `carol+e2e${uniq}@example.com`;
  await registerAndVerify({ email, phone: phone() });
  const token = await login(email);
  const other = await login(email);

  const wrongCurrent = await call('POST', '/auth/password', {
    token, body: { currentPassword: 'nope12345', newPassword: 'NewPassw0rd', confirmPassword: 'NewPassw0rd' },
  });
  assert.equal(wrongCurrent.status, 400);
  assert.equal(wrongCurrent.body.error.code, 'wrong_password');

  const weak = await call('POST', '/auth/password', {
    token, body: { currentPassword: 'Passw0rd!', newPassword: 'short', confirmPassword: 'short' },
  });
  assert.equal(weak.body.error.code, 'weak_password');

  const same = await call('POST', '/auth/password', {
    token, body: { currentPassword: 'Passw0rd!', newPassword: 'Passw0rd!', confirmPassword: 'Passw0rd!' },
  });
  assert.equal(same.body.error.code, 'same_password');

  const ok = await call('POST', '/auth/password', {
    token, body: { currentPassword: 'Passw0rd!', newPassword: 'NewPassw0rd', confirmPassword: 'NewPassw0rd' },
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));

  assert.equal((await call('GET', '/auth/me', { token })).status, 200, 'this phone stays signed in');
  assert.equal((await call('GET', '/auth/me', { token: other })).status, 401, 'other phones are signed out');
  const oldPw = await call('POST', '/auth/login', { body: { email, password: 'Passw0rd!' } });
  assert.equal(oldPw.status, 401);
  await login(email, 'NewPassw0rd');
});

test('forgot password: code by email, new password, every phone signed out', async () => {
  const email = `dave+e2e${uniq}@example.com`;
  const ph = phone();
  await registerAndVerify({ email, phone: ph });
  const token = await login(email);

  const unknown = await call('POST', '/auth/password/forgot', { body: { email: `nobody${uniq}@example.com` } });
  assert.equal(unknown.status, 404);

  const smsBefore = memoryOutbox.length;
  const sent = await call('POST', '/auth/password/forgot', { body: { email: email.toUpperCase() } });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.email, email);
  const mail = [...memoryMailbox].reverse().find((m) => m.to === email);
  assert.ok(mail, 'the code is emailed');
  assert.match(mail.subject, /password reset code/);
  assert.equal(memoryOutbox.length, smsBefore, 'no SMS is sent');
  const code = /\b(\d{6})\b/.exec(mail.text)[1];

  const bad = await call('POST', '/auth/password/reset', {
    body: { email, otp: wrong(code), newPassword: 'Fresh1234', confirmPassword: 'Fresh1234' },
  });
  assert.equal(bad.body.error.code, 'otp_incorrect');

  const weak = await call('POST', '/auth/password/reset', {
    body: { email, otp: code, newPassword: 'short', confirmPassword: 'short' },
  });
  assert.equal(weak.body.error.code, 'weak_password');

  const ok = await call('POST', '/auth/password/reset', {
    body: { email, otp: code, newPassword: 'Fresh1234', confirmPassword: 'Fresh1234' },
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));

  assert.equal((await call('GET', '/auth/me', { token })).status, 401, 'old sessions signed out');
  assert.equal((await call('POST', '/auth/login', { body: { email, password: 'Passw0rd!' } })).status, 401);
  await login(email, 'Fresh1234');

  const reused = await call('POST', '/auth/password/reset', {
    body: { email, otp: code, newPassword: 'Again1234', confirmPassword: 'Again1234' },
  });
  assert.equal(reused.body.error.code, 'otp_not_found', 'a code works only once');
});

test('continue with Google: existing account signs in, new person gives a phone number', async () => {
  // Stand-in for Google: "good:<email>:<name>" is a valid token for that verified email.
  setGoogleVerifierForTests(async (t) => {
    const [kind, email, name] = String(t).split(':');
    if (kind === 'unverified') return { sub: 'g-' + email, email, email_verified: false, name };
    if (kind !== 'good') throw badRequest('invalid_google_token', 'Google sign-in failed. Please try again.');
    return { sub: 'g-' + email, email, email_verified: true, name };
  });
  try {
    // Existing nurse account: signs straight in.
    const email = `erin+e2e${uniq}@example.com`;
    await registerAndVerify({ email, phone: phone() });
    const oldToken = await login(email);
    const r = await call('POST', '/auth/google', { body: { idToken: `good:${email.toUpperCase()}:Erin`, role: 'nurse' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    // First Google sign-in: whoever registered this email with a password is locked out.
    assert.equal((await call('GET', '/auth/me', { token: oldToken })).status, 401);
    assert.equal((await call('POST', '/auth/login', { body: { email, password: 'Passw0rd!' } })).status, 401);
    assert.ok(r.body.token);
    assert.equal(r.body.user.email, email);
    assert.equal((await call('GET', '/auth/me', { token: r.body.token })).status, 200);
    const wrongRole = await call('POST', '/auth/google', { body: { idToken: `good:${email}:Erin`, role: 'client' } });
    assert.equal(wrongRole.body.error.code, 'wrong_role');

    // Bad or unverified Google accounts are refused.
    assert.equal((await call('POST', '/auth/google', { body: { idToken: 'forged', role: 'nurse' } })).status, 400);
    const unv = await call('POST', '/auth/google', { body: { idToken: `unverified:x${uniq}@example.com:X`, role: 'nurse' } });
    assert.equal(unv.body.error.code, 'google_email_unverified');

    // New person: ticket, then phone number. Codes are on in this test file, so the phone gets one.
    const newEmail = `fay+e2e${uniq}@example.com`;
    const first = await call('POST', '/auth/google', { body: { idToken: `good:${newEmail}:Fay Rao`, role: 'client' } });
    assert.equal(first.body.needsSignup, true);
    assert.equal(first.body.fullName, 'Fay Rao');
    const tampered = first.body.signupToken.replace(/^./, (c) => (c === 'e' ? 'f' : 'e'));
    const bad = await call('POST', '/auth/google/signup', { body: { signupToken: tampered, phone: phone(), role: 'client' } });
    assert.equal(bad.body.error.code, 'google_signup_expired');

    const ph = phone();
    const made = await call('POST', '/auth/google/signup', { body: { signupToken: first.body.signupToken, phone: ph, role: 'client' } });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.ok(made.body.token, 'signed in straight away, no SMS code');
    assert.ok(made.body.client, 'a parent opens their own records');
    const [rows] = await authDb.query('SELECT id, google_sub, phone, verification_status FROM users WHERE email = ?', [newEmail]);
    createdUserIds.push(rows[0].id);
    assert.equal(rows[0].google_sub, 'g-' + newEmail);
    assert.equal(rows[0].verification_status, 'verified');
    assert.ok(rows[0].phone, 'phone number saved');
    // Next time: no phone question, straight in.
    const again = await call('POST', '/auth/google', { body: { idToken: `good:${newEmail}:Fay Rao`, role: 'client' } });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.ok(!again.body.needsSignup);
    assert.ok(again.body.client);
    const [crows] = await clientsDb.query('SELECT id FROM clients WHERE user_id = ?', [rows[0].id]);
    crows.forEach((c) => createdClientIds.push(c.id));
  } finally {
    setGoogleVerifierForTests(null);
  }
});

test('phone numbers typed in common Indian forms become one number', () => {
  for (const p of ['9876543210', '919876543210', '+91 09876543210', '098765 43210', '0091 98765 43210', '+91-98765-43210']) {
    assert.equal(normalizePhone(p), '+919876543210', p);
  }
  for (const p of ['8765432', '5876543210', '+9112345678901', '98765432101']) assert.equal(normalizePhone(p), null, p);
  assert.equal(normalizePhone('+1 415 555 0100'), '+14155550100');
});

test('a double-tapped sign-up makes one account and never a server error', async () => {
  const email = `dbl+e2e${uniq}@example.com`;
  const ph = phone();
  const body = { fullName: 'Double Tap', phone: ph, email, password: 'Passw0rd!', confirmPassword: 'Passw0rd!' };
  const results = await Promise.all([1, 2, 3, 4].map(() => call('POST', '/auth/register', { body })));
  const [rows] = await authDb.query('SELECT id FROM users WHERE email = ?', [email]);
  rows.forEach((r) => createdUserIds.push(r.id));
  for (const r of results) assert.ok([201, 409, 429].includes(r.status), `${r.status} ${JSON.stringify(r.body)}`);
  assert.ok(results.some((r) => r.status === 201));
  assert.equal(rows.length, 1);
});
