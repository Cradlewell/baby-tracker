// End-to-end test of the full flow against the real MySQL databases configured in server/.env:
// Registration -> OTP -> Login -> Client phone -> Client OTP -> monitoring data.
// SMS go to an in-memory outbox; every user and client the test creates is deleted afterwards.
process.env.OTP_ENABLED = 'true';
process.env.CLIENT_CODE_CHANNEL = 'sms';
process.env.SMS_PROVIDER = 'memory';
process.env.EMAIL_PROVIDER = 'memory';
process.env.GOOGLE_CLIENT_IDS = 'test-client.apps.googleusercontent.com';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '0';
process.env.OTP_DAILY_LIMIT = '0';
process.env.NURSE_APPROVAL = 'false';
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
const { config } = await import('../src/config.js');

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

// A family always belongs to a parent's account: make the parent (signed up, verified) and
// their family. The parent's email gets the family's access codes.
async function createParent(ph, name = 'Test Parent') {
  const [u] = await authDb.query(
    `INSERT INTO users (full_name, phone, email, password_hash, verification_status, verified_at, role)
     VALUES (?, ?, ?, 'x', 'verified', UTC_TIMESTAMP(), 'client')`,
    [name, ph, `parent${ph.slice(-8)}+e2e${uniq}@example.com`]
  );
  createdUserIds.push(u.insertId);
  return u.insertId;
}
async function createClient(name, ph) {
  const parentId = await createParent(ph, name);
  const [res] = await clientsDb.query('INSERT INTO clients (name, phone, user_id) VALUES (?, ?, ?)', [name, ph, parentId]);
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
  // Families made by these test accounts' own sign-ups (a parent's family is created at login).
  if (ids.length) await clientsDb.query('DELETE FROM clients WHERE user_id IN (?)', [ids]);
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
  // A family this nurse has never opened (one already opened would need no code).
  const ph = phone();
  await createClient('Lock Test', ph);
  await call('POST', '/client/request-otp', { token, body: { phone: ph } });
  const code = lastCodeFor(ph);
  let last;
  for (let i = 0; i < 5; i++) {
    last = await call('POST', '/client/verify-otp', { token, body: { phone: ph, otp: wrong(code) } });
  }
  assert.equal(last.status, 429);
  assert.equal(last.body.error.code, 'otp_locked');
  const tooLate = await call('POST', '/client/verify-otp', { token, body: { phone: ph, otp: code } });
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

test("Google sign-up with a family's phone number needs that phone's SMS code", async () => {
  setGoogleVerifierForTests(async (t) => {
    const [, email, name] = String(t).split(':');
    return { sub: 'g-' + email, email, email_verified: true, name };
  });
  try {
    // A family's phone number belongs to its parent's account, so nobody else can sign up with it.
    const famPhone = phone();
    await createClient('Family G', famPhone);
    const email = `gus+e2e${uniq}@example.com`;
    const ticket = (await call('POST', '/auth/google', { body: { idToken: `good:${email}:Gus`, role: 'client' } })).body.signupToken;
    const r = await call('POST', '/auth/google/signup', { body: { signupToken: ticket, phone: famPhone, role: 'client' } });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.error.code, 'phone_taken');
    assert.ok(!r.body.token);

    // A nurse registered this family before the parent signed up (no owner yet). Proving the
    // phone with the SMS code hands it over.
    const orphanPhone = phone();
    const [o] = await clientsDb.query('INSERT INTO clients (name, phone) VALUES (?, ?)', ['Nurse Family', orphanPhone]);
    createdClientIds.push(o.insertId);
    const ticket2 = (await call('POST', '/auth/google', { body: { idToken: `good:hal+e2e${uniq}@example.com:Hal`, role: 'client' } })).body.signupToken;
    const r2 = await call('POST', '/auth/google/signup', { body: { signupToken: ticket2, phone: orphanPhone, role: 'client' } });
    assert.equal(r2.body.otpRequired, true, JSON.stringify(r2.body));
    const [hal] = await authDb.query('SELECT id FROM users WHERE email = ?', [`hal+e2e${uniq}@example.com`]);
    createdUserIds.push(hal[0].id);
    const ok = await call('POST', '/auth/google/signup/verify', { body: { signupToken: ticket2, otp: lastCodeFor(orphanPhone) } });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.client.id, o.insertId);
    const [linked] = await clientsDb.query('SELECT user_id FROM clients WHERE id = ?', [o.insertId]);
    assert.equal(Number(linked[0].user_id), hal[0].id);

    // With codes off: Google with the email the admin entered for the family opens it; any other
    // way (another Google email, or a password sign-up) is refused.
    const fam3 = phone();
    const famMail = `famowner+e2e${uniq}@example.com`;
    const [f3] = await clientsDb.query('INSERT INTO clients (name, phone, email, email_trusted) VALUES (?, ?, ?, 1)', ['Family K', fam3, famMail]);
    createdClientIds.push(f3.insertId);
    // An email a nurse typed is not trusted: it could be the nurse's own.
    const fam4 = phone();
    const nurseMail = `nurseset+e2e${uniq}@example.com`;
    const [f4] = await clientsDb.query('INSERT INTO clients (name, phone, email) VALUES (?, ?, ?)', ['Family L', fam4, nurseMail]);
    createdClientIds.push(f4.insertId);
    config.otpEnabled = false;
    try {
      const sneaky = (await call('POST', '/auth/google', { body: { idToken: `good:${nurseMail}:Sneaky`, role: 'client' } })).body.signupToken;
      const refused = await call('POST', '/auth/google/signup', { body: { signupToken: sneaky, phone: fam4, role: 'client' } });
      assert.equal(refused.body.error?.code, 'phone_needs_verification', JSON.stringify(refused.body));
      const [stillFree] = await clientsDb.query('SELECT user_id FROM clients WHERE id = ?', [f4.insertId]);
      assert.equal(stillFree[0].user_id, null);
      const other = (await call('POST', '/auth/google', { body: { idToken: `good:kim+e2e${uniq}@example.com:Kim`, role: 'client' } })).body.signupToken;
      const no = await call('POST', '/auth/google/signup', { body: { signupToken: other, phone: fam3, role: 'client' } });
      assert.equal(no.body.error.code, 'phone_needs_verification', JSON.stringify(no.body));
      const pw = await call('POST', '/auth/register', {
        body: { fullName: 'Kim', phone: fam3, email: `kim2+e2e${uniq}@example.com`, password: 'Passw0rd!', confirmPassword: 'Passw0rd!', role: 'client' },
      });
      assert.equal(pw.status, 403);
      assert.equal(pw.body.error.code, 'family_needs_check');
      const owner = (await call('POST', '/auth/google', { body: { idToken: `good:${famMail}:Owner`, role: 'client' } })).body.signupToken;
      const yes = await call('POST', '/auth/google/signup', { body: { signupToken: owner, phone: fam3, role: 'client' } });
      assert.equal(yes.status, 201, JSON.stringify(yes.body));
      assert.equal(yes.body.client.id, f3.insertId);
      const [ou] = await authDb.query('SELECT id FROM users WHERE email = ?', [famMail]);
      createdUserIds.push(ou[0].id);
    } finally {
      config.otpEnabled = true;
    }

    // A brand-new number still goes straight in with codes off.
    const email2 = `ivy+e2e${uniq}@example.com`;
    const t2 = (await call('POST', '/auth/google', { body: { idToken: `good:${email2}:Ivy`, role: 'client' } })).body.signupToken;
    config.otpEnabled = false;
    try {
      const fresh = await call('POST', '/auth/google/signup', { body: { signupToken: t2, phone: phone(), role: 'client' } });
      assert.equal(fresh.status, 201, JSON.stringify(fresh.body));
      const [u2] = await authDb.query('SELECT id FROM users WHERE email = ?', [email2]);
      createdUserIds.push(u2[0].id);
      const [c2] = await clientsDb.query('SELECT id FROM clients WHERE user_id = ?', [u2[0].id]);
      c2.forEach((c) => createdClientIds.push(c.id));
    } finally {
      config.otpEnabled = true;
    }
  } finally {
    setGoogleVerifierForTests(null);
  }
});

test("a nurse's access code is emailed to the parent", async () => {
  const lastMailCode = (to) => {
    const m = [...memoryMailbox].reverse().find((x) => x.to === to);
    assert.ok(m, `expected an email to ${to}`);
    return /(\d{6})/.exec(m.subject)[1];
  };
  config.clientCodeChannel = 'email';
  try {
    const nurseEmail = `nina+e2e${uniq}@example.com`;
    await registerAndVerify({ email: nurseEmail, phone: phone() });
    const token = await login(nurseEmail);

    // A parent with their own account: the code goes to the email they signed up with.
    const parentEmail = `pam+e2e${uniq}@example.com`;
    const parentPhone = phone();
    const reg = await call('POST', '/auth/register', {
      body: { fullName: 'Pam Parent', phone: parentPhone, email: parentEmail, password: 'Passw0rd!', confirmPassword: 'Passw0rd!', role: 'client' },
    });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    await call('POST', '/auth/register/verify', { body: { email: parentEmail, otp: lastCodeFor(parentPhone) } });
    const [pu] = await authDb.query('SELECT id FROM users WHERE email = ?', [parentEmail]);
    createdUserIds.push(pu[0].id);
    const pl = await call('POST', '/auth/login', { body: { email: parentEmail, password: 'Passw0rd!', role: 'client' } });
    assert.equal(pl.status, 200, JSON.stringify(pl.body)); // makes the family's client record
    const [pc] = await clientsDb.query('SELECT id FROM clients WHERE phone = ?', [parentPhone]);
    createdClientIds.push(pc[0].id);

    const smsBefore = memoryOutbox.length;
    const r = await call('POST', '/client/request-otp', { token, body: { phone: parentPhone } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.sentTo, 'email');
    assert.equal(r.body.emailMasked, `pa${'*'.repeat(`pam+e2e${uniq}`.length - 2)}@example.com`);
    assert.equal(memoryOutbox.length, smsBefore, 'no SMS is sent');
    const code = lastMailCode(parentEmail);
    assert.equal((await call('POST', '/client/verify-otp', { token, body: { phone: parentPhone, otp: wrong(code) } })).status, 400);
    const ok = await call('POST', '/client/verify-otp', { token, body: { phone: parentPhone, otp: code } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.client.id, pc[0].id);
    // A second nurse cannot redirect the code to their own email when the parent has an account.
    const nurse2 = `nora+e2e${uniq}@example.com`;
    await registerAndVerify({ email: nurse2, phone: phone() });
    const token2 = await login(nurse2);
    const nurseTry = await call('POST', '/client/request-otp', { token: token2, body: { phone: parentPhone, email: nurse2 } });
    assert.equal(nurseTry.body.sentTo, 'email');
    assert.ok(nurseTry.body.emailMasked.startsWith('pa'), 'still goes to the parent');

    // A family with a parent account: an email the nurse sends along is ignored.
    const famPhone = phone();
    const famId = await createClient('Family E', famPhone);
    const sent = await call('POST', '/client/request-otp', { token, body: { phone: famPhone, email: `nosy+e2e${uniq}@example.com` } });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.ok(!memoryMailbox.some((m) => m.to === `nosy+e2e${uniq}@example.com`));
    const famEmail = `parent${famPhone.slice(-8)}+e2e${uniq}@example.com`;
    const v = await call('POST', '/client/verify-otp', { token, body: { phone: famPhone, otp: lastMailCode(famEmail) } });
    assert.equal(v.status, 200, JSON.stringify(v.body));
    assert.equal(v.body.client.id, famId);

    // A new family (parent not signed up yet): the nurse adds it with the parent's email.
    const noEmail = await call('POST', '/client', { token, body: { name: 'New Fam', phone: phone() } });
    assert.equal(noEmail.body.error.code, 'email_needed');
    const newPhone = phone();
    const made = await call('POST', '/client', { token, body: { name: 'New Fam', phone: newPhone, email: `new+e2e${uniq}@example.com` } });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal(made.body.sentTo, 'email');
    const [nc] = await clientsDb.query('SELECT id FROM clients WHERE phone = ?', [newPhone]);
    createdClientIds.push(nc[0].id);
  } finally {
    config.clientCodeChannel = 'sms';
  }
});

test('a nurse enters a family code once; the family reopens for 30 days; a new nurse or a revoke needs a code', async () => {
  const famPhone = phone();
  const famId = await createClient('Access Fam', famPhone);
  const nurse = `olga+e2e${uniq}@example.com`;
  await registerAndVerify({ email: nurse, phone: phone() });
  const open = async (token) => call('POST', '/client/request-otp', { token, body: { phone: famPhone } });

  // First time: a code.
  let token = await login(nurse);
  const first = await open(token);
  assert.equal(first.body.otpRequired, true);
  await call('POST', '/client/verify-otp', { token, body: { phone: famPhone, otp: lastCodeFor(famPhone) } });

  // Same nurse, same family; then after logging out and in again (or on another phone): straight
  // to the family's dashboard, no number and no code.
  const sms = memoryOutbox.length;
  assert.equal((await open(token)).body.otpRequired, false);
  await call('POST', '/auth/logout', { token });
  const relog = await call('POST', '/auth/login', { body: { email: nurse, password: 'Passw0rd!' } });
  assert.equal(relog.body.client?.id, famId, 'login reopens the family: ' + JSON.stringify(relog.body));
  token = relog.body.token;
  const again = await open(token);
  assert.equal(again.body.otpRequired, false, JSON.stringify(again.body));
  assert.equal(again.body.client.id, famId);
  assert.equal(memoryOutbox.length, sms, 'no code was sent');
  assert.equal((await call('GET', '/data/babies', { token })).status, 200);
  // "Your families" lists it (full number, no code needed); other nurses' families are not listed.
  const mine = await call('GET', '/client/mine', { token });
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  assert.deepEqual(mine.body.clients.map((c) => c.id), [famId]);
  assert.equal(mine.body.clients[0].phone, famPhone);
  assert.equal(mine.body.clients[0].codeNeeded, false);
  // The list keeps a family for 30 days after this nurse last logged an entry for its babies.
  const baby = { id: `bacc${uniq}`, name: 'Acc Baby', dob: '2026-01-01' };
  await call('PATCH', '/data/babies', { token, body: { upsert: [baby], delete: [], order: [baby.id] } });
  await call('PATCH', `/data/babies/${baby.id}/records/diaper`, { token, body: { upsert: [{ id: 'd1', eventType: 'urine' }], delete: [], order: ['d1'] } });
  const [[nu]] = await authDb.query('SELECT id FROM users WHERE email = ?', [nurse]);
  const age = async (days) => {
    await clientsDb.query('UPDATE monitoring_records SET updated_at = UTC_TIMESTAMP() - INTERVAL ? DAY WHERE baby_id = ?', [days, baby.id]);
    await clientsDb.query('UPDATE client_access SET granted_at = UTC_TIMESTAMP() - INTERVAL 60 DAY WHERE user_id = ? AND client_id = ?', [nu.id, famId]);
  };
  await age(29);
  assert.deepEqual((await call('GET', '/client/mine', { token })).body.clients.map((c) => c.id), [famId], 'tracked 29 days ago: listed');
  await age(31);
  assert.deepEqual((await call('GET', '/client/mine', { token })).body.clients, [], 'tracked 31 days ago: gone');
  await clientsDb.query('UPDATE client_access SET granted_at = UTC_TIMESTAMP() WHERE user_id = ? AND client_id = ?', [nu.id, famId]);
  // Reopening the app: the family is still open in this login, no number asked.
  const me = await call('GET', '/auth/me', { token });
  assert.equal(me.body.client?.id, famId, JSON.stringify(me.body));

  // A different nurse: a code.
  const other = `pia+e2e${uniq}@example.com`;
  await registerAndVerify({ email: other, phone: phone() });
  const otherToken = await login(other);
  assert.equal((await open(otherToken)).body.otpRequired, true);
  assert.deepEqual((await call('GET', '/client/mine', { token: otherToken })).body.clients, [], 'not verified: not listed');

  // Revoked while the family is open: the next data request is refused, and a code is needed.
  const [[u]] = await authDb.query('SELECT id FROM users WHERE email = ?', [nurse]);
  await clientsDb.query('UPDATE client_access SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND client_id = ?', [u.id, famId]);
  const [[sess]] = await authDb.query('SELECT client_id FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY id DESC LIMIT 1', [u.id]);
  assert.equal(Number(sess.client_id), famId);
  const meRevoked = await call('GET', '/auth/me', { token });
  assert.equal(meRevoked.body.client, null, 'reopening after a revoke asks for the number');
  await authDb.query('UPDATE sessions SET client_id = ? WHERE user_id = ? AND revoked_at IS NULL', [famId, u.id]);
  const refused = await call('GET', '/data/babies', { token });
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error.code, 'client_access_ended');
  assert.equal((await open(token)).body.otpRequired, true);
  await call('POST', '/client/verify-otp', { token, body: { phone: famPhone, otp: lastCodeFor(famPhone) } });
  assert.equal((await open(token)).body.otpRequired, false, 'a new code gives access again');

  // 30 days after the number was last entered: asked for the number again on opening the app and
  // at login, but no code, since this nurse already verified this family.
  await clientsDb.query('UPDATE client_access SET opened_at = UTC_TIMESTAMP() - INTERVAL 31 DAY WHERE user_id = ? AND client_id = ?', [u.id, famId]);
  assert.equal((await call('GET', '/auth/me', { token })).body.client, null, 'number asked after 30 days');
  const after30 = await call('POST', '/auth/login', { body: { email: nurse, password: 'Passw0rd!' } });
  assert.equal(after30.body.client, null);
  const back = await open(after30.body.token);
  assert.equal(back.body.otpRequired, false, 'served before: no code');
  const relog2 = await call('POST', '/auth/login', { body: { email: nurse, password: 'Passw0rd!' } });
  assert.equal(relog2.body.client?.id, famId, 'entering the number starts another 30 days');

  // An expiry, when one is configured: a code.
  await clientsDb.query('UPDATE client_access SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE user_id = ? AND client_id = ?', [u.id, famId]);
  assert.equal((await open(token)).body.otpRequired, true);
});

test('Play Store: public privacy and delete-account pages, crash reports, delete account', async () => {
  for (const path of ['/privacy', '/delete-account']) {
    const r = await fetch(`${base}${path}`);
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(await r.text(), /Delete account/);
  }

  const crash = await call('POST', '/crash', { body: { message: `e2e crash ${uniq}`, stack: 'at x', fatal: true, appVersion: '2.0.0', platform: 'android 14', screen: 'Home' } });
  assert.equal(crash.status, 204);
  const [cr] = await authDb.query('SELECT id, is_fatal FROM crash_reports WHERE message = ?', [`e2e crash ${uniq}`]);
  assert.equal(cr.length, 1);
  await authDb.query('DELETE FROM crash_reports WHERE id = ?', [cr[0].id]);
  assert.equal((await call('POST', '/crash', { body: {} })).status, 400);

  // A parent: account, family, babies and records all go; a nurse with access loses it.
  const parentEmail = `del+e2e${uniq}@example.com`;
  const parentPhone = phone();
  const reg = await call('POST', '/auth/register', {
    body: { fullName: 'Del Parent', phone: parentPhone, email: parentEmail, password: 'Passw0rd!', confirmPassword: 'Passw0rd!', role: 'client' },
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  await call('POST', '/auth/register/verify', { body: { email: parentEmail, otp: lastCodeFor(parentPhone) } });
  const pl = await call('POST', '/auth/login', { body: { email: parentEmail, password: 'Passw0rd!', role: 'client' } });
  assert.equal(pl.status, 200, JSON.stringify(pl.body));
  assert.equal(pl.body.user.google, false);
  const ptoken = pl.body.token;
  const clientId = pl.body.client.id;
  const baby = { id: `bdel${uniq}`, name: 'Del Baby', dob: '2026-01-01' };
  assert.equal((await call('PATCH', '/data/babies', { token: ptoken, body: { upsert: [baby], delete: [], order: [baby.id] } })).status, 200);
  await clientsDb.query("INSERT INTO client_access (user_id, client_id, expires_at) VALUES (999999999, ?, NULL)", [clientId]);

  const noConfirm = await call('POST', '/auth/account/delete', { token: ptoken, body: { password: 'Passw0rd!' } });
  assert.equal(noConfirm.body.error.code, 'confirm_required');
  const badPw = await call('POST', '/auth/account/delete', { token: ptoken, body: { confirm: 'DELETE', password: 'nope1234' } });
  assert.equal(badPw.body.error.code, 'wrong_password');
  const del = await call('POST', '/auth/account/delete', { token: ptoken, body: { confirm: 'DELETE', password: 'Passw0rd!' } });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.equal((await authDb.query('SELECT id FROM users WHERE email = ?', [parentEmail]))[0].length, 0);
  assert.equal((await clientsDb.query('SELECT id FROM clients WHERE id = ?', [clientId]))[0].length, 0);
  assert.equal((await clientsDb.query('SELECT id FROM babies WHERE id = ?', [baby.id]))[0].length, 0);
  assert.equal((await clientsDb.query('SELECT 1 FROM client_access WHERE client_id = ?', [clientId]))[0].length, 0);
  assert.equal((await call('GET', '/auth/me', { token: ptoken })).status, 401, 'signed out everywhere');

  // A nurse: account and access go; the family and its records stay.
  const famPhone = phone();
  const famId = await createClient('Kept Family', famPhone);
  const nurseEmail = `delnurse+e2e${uniq}@example.com`;
  await registerAndVerify({ email: nurseEmail, phone: phone() });
  const ntoken = await login(nurseEmail);
  await call('POST', '/client/request-otp', { token: ntoken, body: { phone: famPhone } });
  await call('POST', '/client/verify-otp', { token: ntoken, body: { phone: famPhone, otp: lastCodeFor(famPhone) } });
  const nd = await call('POST', '/auth/account/delete', { token: ntoken, body: { confirm: 'DELETE', password: 'Passw0rd!' } });
  assert.equal(nd.status, 200, JSON.stringify(nd.body));
  assert.equal((await clientsDb.query('SELECT 1 FROM client_access WHERE client_id = ?', [famId]))[0].length, 0);
  assert.equal((await clientsDb.query('SELECT id FROM clients WHERE id = ?', [famId]))[0].length, 1, 'family kept');
});

test('at most 4 codes a day go to the same email', async () => {
  config.otpDailyLimit = 4;
  try {
    const email = `quota+e2e${uniq}@example.com`;
    await registerAndVerify({ email, phone: phone() });
    // (The sign-up code went to the phone, so it does not count for the email.)
    for (let i = 0; i < 4; i++) {
      assert.equal((await call('POST', '/auth/password/forgot', { body: { email } })).status, 200, `code ${i + 1}`);
    }
    // The 5th code to this email in a day is refused.
    const fifth = await call('POST', '/auth/password/forgot', { body: { email } });
    assert.equal(fifth.status, 429, JSON.stringify(fifth.body));
    assert.equal(fifth.body.error.code, 'otp_daily_limit');
    assert.match(fifth.body.error.message, /Only 4 codes .* email address in a day\. Please try again in 24 hours/);
    // A day later the oldest code no longer counts.
    const [[u]] = await authDb.query('SELECT id FROM users WHERE email = ?', [email]);
    await authDb.query('UPDATE otp_codes SET created_at = created_at - INTERVAL 25 HOUR WHERE user_id = ? AND phone = ? ORDER BY id LIMIT 1', [u.id, email]);
    assert.equal((await call('POST', '/auth/password/forgot', { body: { email } })).status, 200);
  } finally {
    config.otpDailyLimit = 0;
  }
});

test('admin dashboard: only admin-role accounts log in; nurses, families, parents and weekly visits', async () => {
  const page = await fetch(`${base}/admin/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Cradlewell Admin Portal/);

  const adminEmail = `boss+e2e${uniq}@example.com`;
  await registerAndVerify({ email: adminEmail, phone: phone() });
  const notYet = await call('POST', '/admin/api/login', { body: { email: adminEmail, password: 'Passw0rd!' } });
  assert.equal(notYet.status, 401, 'a normal account is not an admin');
  assert.equal((await call('GET', '/admin/api/overview')).status, 401);

  await authDb.query("UPDATE users SET role = 'admin' WHERE email = ?", [adminEmail]);
  try {
    const bad = await call('POST', '/admin/api/login', { body: { email: adminEmail, password: 'wrong123' } });
    assert.equal(bad.status, 401);
    const ok = await call('POST', '/admin/api/login', { body: { email: adminEmail, password: 'Passw0rd!' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const token = ok.body.token;

    // A nurse who works in a family's records today: one visit (however many requests).
    const famPhone = phone();
    const famId = await createClient('Visit Fam', famPhone);
    const nurseEmail = `vic+e2e${uniq}@example.com`;
    await registerAndVerify({ email: nurseEmail, phone: phone() });
    const ntoken = await login(nurseEmail);
    await verifyClient(ntoken, famPhone);
    for (let i = 0; i < 3; i++) assert.equal((await call('GET', '/data/babies', { token: ntoken })).status, 200);
    // A non-admin nurse token cannot read the dashboard.
    assert.equal((await call('GET', '/admin/api/overview', { token: ntoken })).status, 403);

    const o = await call('GET', '/admin/api/overview', { token });
    assert.equal(o.status, 200, JSON.stringify(o.body));
    assert.equal(o.body.weeks.length, 12);
    assert.ok(o.body.totals.visitsThisWeek >= 1);
    for (const k of ['nurses', 'parents', 'families', 'babies', 'activeParents7', 'activeParents30']) assert.equal(typeof o.body.totals[k], 'number', k);

    const n = await call('GET', '/admin/api/nurses', { token });
    const me = n.body.nurses.find((x) => x.email === nurseEmail);
    assert.equal(me.visits7, 1, 'three requests on one day are one visit');
    assert.equal(me.families, 1);

    const f = await call('GET', '/admin/api/families', { token });
    const fam = f.body.families.find((x) => x.id === famId);
    assert.equal(fam.visits30, 1);
    assert.equal(fam.nurses, 1);
    assert.match(fam.code, /^CW-C-\d{4,}$/);
    assert.deepEqual(fam.assignedNurses.map((x) => x.name), ['Test User']);

    const as = await call('GET', '/admin/api/assignments', { token });
    const mine = as.body.assignments.find((x) => x.clientId === famId);
    assert.equal(mine.nurseEmail, nurseEmail);
    assert.equal(mine.visits30, 1);

    // A baby with a feed, for the monthly report.
    const baby = { id: `brep${uniq}`, name: 'Vihaan', dob: '01/09/2026' };
    await call('PATCH', '/data/babies', { token: ntoken, body: { upsert: [baby], delete: [], order: [baby.id] } });
    await call('PATCH', `/data/babies/${baby.id}/records/feeding`, { token: ntoken, body: { upsert: [{ id: 'f1', type: 'bottle', startTime: new Date().toISOString(), consumedQty: 60, unit: 'ml' }], delete: [], order: ['f1'] } });
    // The app's monthly report is built in the admin's browser from the baby's saved records.
    const recs = await call('GET', `/admin/api/families/${famId}/babies/${baby.id}/records`, { token });
    assert.equal(recs.status, 200, JSON.stringify(recs.body));
    assert.equal(recs.body.baby.name, 'Vihaan');
    assert.equal(recs.body.records.feeding.length, 1);
    assert.equal((await call('GET', `/admin/api/families/${famId}/babies/nope/records`, { token })).status, 404);

    const ov = await call('GET', '/admin/api/overview', { token });
    assert.ok(ov.body.care.nurseAssisted >= 1);
    assert.equal(ov.body.care.nurseAssisted + ov.body.care.selfTracking, ov.body.totals.families);
    assert.ok(ov.body.totals.appUsers >= ov.body.totals.nurses + ov.body.totals.parents);


    // Quick actions: add a family, add a nurse who can then log in to the app.
    const newFamPhone = phone();
    const addFam = await call('POST', '/admin/api/clients', { token, body: { name: 'Admin Fam', phone: newFamPhone, email: `af+e2e${uniq}@example.com` } });
    assert.equal(addFam.status, 201, JSON.stringify(addFam.body));
    createdClientIds.push(addFam.body.id);
    assert.equal((await call('POST', '/admin/api/clients', { token, body: { name: 'Again', phone: newFamPhone } })).status, 409);
    const nurseNew = `newnurse+e2e${uniq}@example.com`;
    const addN = await call('POST', '/admin/api/nurses', { token, body: { name: 'New Nurse', email: nurseNew, phone: phone() } });
    assert.equal(addN.status, 201, JSON.stringify(addN.body));
    createdUserIds.push(addN.body.id);
    const nl = await call('POST', '/auth/login', { body: { email: nurseNew, password: addN.body.password, role: 'nurse' } });
    assert.equal(nl.status, 200, 'the new nurse logs in with the shown password');
    assert.equal((await call('POST', '/admin/api/nurses', { token, body: { name: 'Dup', email: nurseNew, phone: phone() } })).status, 409);

    const p = await call('GET', '/admin/api/parents', { token });
    assert.ok(Array.isArray(p.body.parents));
  } finally {
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

test('nurse approval: a new nurse waits, the admin approves or rejects, and the nurse is emailed', async () => {
  const adminEmail = `boss2+e2e${uniq}@example.com`;
  await registerAndVerify({ email: adminEmail, phone: phone() });
  await authDb.query("UPDATE users SET role = 'admin' WHERE email = ?", [adminEmail]);
  config.nurseApproval = true;
  try {
    const nurseA = `waitnurse+e2e${uniq}@example.com`;
    const nurseB = `rejectme+e2e${uniq}@example.com`;
    const reg = await call('POST', '/auth/register', {
      body: { fullName: 'New Nurse', phone: phone(), email: nurseA, password: 'Passw0rd!', confirmPassword: 'Passw0rd!', role: 'nurse' },
    });
    assert.equal(reg.body.approvalPending, true);
    await authDb.query('DELETE FROM users WHERE email = ?', [nurseA]);
    const idA = await registerAndVerify({ email: nurseA, phone: phone(), name: 'New Nurse' });
    const idB = await registerAndVerify({ email: nurseB, phone: phone(), name: 'Reject Me' });

    // Waiting: no login, with a clear reason.
    const wait = await call('POST', '/auth/login', { body: { email: nurseA, password: 'Passw0rd!', role: 'nurse' } });
    assert.equal(wait.status, 403);
    assert.equal(wait.body.error.code, 'approval_pending');

    // A parent signing up is never held back.
    const parentEmail = `freeparent+e2e${uniq}@example.com`;
    const pr = await call('POST', '/auth/register', {
      body: { fullName: 'Free Parent', phone: phone(), email: parentEmail, password: 'Passw0rd!', confirmPassword: 'Passw0rd!', role: 'client' },
    });
    assert.equal(pr.body.approvalPending, false);

    const token = (await call('POST', '/admin/api/login', { body: { email: adminEmail, password: 'Passw0rd!' } })).body.token;
    const ov = await call('GET', '/admin/api/overview', { token });
    const waiting = ov.body.pendingNurses.map((n) => n.id);
    assert.ok(waiting.includes(idA) && waiting.includes(idB));

    // Only an admin can decide.
    const nurseTry = await call('POST', `/admin/api/nurses/${idA}/approve`);
    assert.equal(nurseTry.status, 401);

    memoryMailbox.length = 0;
    const ap = await call('POST', `/admin/api/nurses/${idA}/approve`, { token });
    assert.equal(ap.status, 200, JSON.stringify(ap.body));
    assert.equal(ap.body.emailed, true);
    assert.ok(memoryMailbox.some((m) => m.to === nurseA && /approved/.test(m.subject)));
    assert.equal((await call('POST', `/admin/api/nurses/${idA}/approve`, { token })).status, 404, 'already decided');
    await login(nurseA);

    const rj = await call('POST', `/admin/api/nurses/${idB}/reject`, { token });
    assert.equal(rj.status, 200);
    assert.ok(memoryMailbox.some((m) => m.to === nurseB));
    const no = await call('POST', '/auth/login', { body: { email: nurseB, password: 'Passw0rd!', role: 'nurse' } });
    assert.equal(no.body.error.code, 'approval_rejected');
    // A rejected nurse can't sign up again with the same email.
    const again = await call('POST', '/auth/register', {
      body: { fullName: 'Reject Me', phone: phone(), email: nurseB, password: 'Passw0rd!', confirmPassword: 'Passw0rd!', role: 'nurse' },
    });
    assert.equal(again.status, 409);

    const after = await call('GET', '/admin/api/overview', { token });
    assert.ok(!after.body.pendingNurses.some((n) => n.id === idA || n.id === idB));

    // Not decided within 10 days: the request is removed, the nurse is emailed and can sign up again.
    const slowEmail = `slownurse+e2e${uniq}@example.com`;
    const slowPhone = phone();
    const idC = await registerAndVerify({ email: slowEmail, phone: slowPhone, name: 'Slow Nurse' });
    let list = (await call('GET', '/admin/api/overview', { token })).body;
    const shown = list.pendingNurses.find((n) => n.id === idC);
    assert.ok(shown && new Date(shown.expires) > Date.now(), 'still waiting, with an expiry date');
    await authDb.query('UPDATE users SET created_at = UTC_TIMESTAMP() - INTERVAL 11 DAY WHERE id = ?', [idC]);
    memoryMailbox.length = 0;
    list = (await call('GET', '/admin/api/overview', { token })).body;
    assert.ok(!list.pendingNurses.some((n) => n.id === idC), 'expired request removed');
    assert.equal((await authDb.query('SELECT id FROM users WHERE id = ?', [idC]))[0].length, 0);
    assert.ok(memoryMailbox.some((m) => m.to === slowEmail && /expired/.test(m.subject)));
    await registerAndVerify({ email: slowEmail, phone: slowPhone, name: 'Slow Nurse' });
    await call('POST', '/admin/api/logout', { token });
  } finally {
    config.nurseApproval = false;
  }
});

test('security fixes: nurse email, re-registration, per-kind code limit, big sync', async () => {
  // A family with baby records and no email on file: a nurse cannot send its code to an email they type.
  config.clientCodeChannel = 'email';
  try {
    const nurse = `emailnurse+e2e${uniq}@example.com`;
    await registerAndVerify({ email: nurse, phone: phone() });
    const token = await login(nurse);
    const famPhone = phone();
    const [f] = await clientsDb.query('INSERT INTO clients (name, phone) VALUES (?, ?)', ['No Email Fam', famPhone]);
    createdClientIds.push(f.insertId);
    await clientsDb.query("INSERT INTO babies (id, client_id, name, details) VALUES (?, ?, 'Bo', '{}')", [`nb${uniq}`, f.insertId]);
    const r = await call('POST', '/client/request-otp', { token, body: { phone: famPhone, email: nurse } });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.error.code, 'family_email_missing');
    assert.ok(!memoryMailbox.some((m) => m.to === nurse && /access code/.test(m.subject)));
  } finally {
    config.clientCodeChannel = 'sms';
  }

  config.otpDailyLimit = 2;
  try {
    // Signing up again (which deletes the unfinished sign-up) no longer resets the phone's daily limit.
    const target = phone();
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const reg = await call('POST', '/auth/register', {
        body: { fullName: 'Spam', phone: target, email: `spam+e2e${uniq}@example.com`, password: 'Passw0rd!', confirmPassword: 'Passw0rd!' },
      });
      statuses.push(reg.body.error?.code || reg.status);
    }
    assert.deepEqual(statuses, [201, 201, 'otp_daily_limit']);

    // Using up one kind of code does not block another kind to the same address.
    const email = `kinds+e2e${uniq}@example.com`;
    const userId = await registerAndVerify({ email, phone: phone() });
    for (let i = 0; i < 2; i++) assert.equal((await call('POST', '/auth/password/forgot', { body: { email } })).status, 200);
    assert.equal((await call('POST', '/auth/password/forgot', { body: { email } })).status, 429);
    const { issueOtp } = await import('../src/otp.js');
    await issueOtp({ purpose: 'client_access', userId, phone: '+910000000000', email });
  } finally {
    config.otpDailyLimit = 0;
  }

  // A large sync is written in batches and keeps the order the app sent.
  const famPhone = phone();
  await createClient('Big Fam', famPhone);
  const token = await login(emailA);
  await verifyClient(token, famPhone);
  const baby = { id: `big${uniq}`, name: 'Big' };
  assert.equal((await call('PATCH', '/data/babies', { token, body: { upsert: [baby], order: [baby.id] } })).status, 200);
  const path = `/data/babies/${baby.id}/records/feeding`;
  const items = Array.from({ length: 1201 }, (_, i) => ({ id: `r${i}`, amount: i }));
  let r = await call('PATCH', path, { token, body: { upsert: items, order: items.map((x) => x.id) } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const reversed = items.map((x) => x.id).reverse();
  r = await call('PATCH', path, { token, body: { order: reversed, delete: ['r5', 'r600'] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const got = (await call('GET', path, { token })).body.items.map((x) => x.id);
  assert.deepEqual(got, reversed.filter((id) => id !== 'r5' && id !== 'r600'));
});
