import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authDb, clientsDb } from '../db.js';
import { config } from '../config.js';
import { createSession, revokeSession, requireAuth, indiaDate } from '../sessions.js';
import crypto from 'node:crypto';
import { unauthorized, forbidden, badRequest, notFound, conflict } from '../errors.js';
import { sendEmail } from '../email.js';
import { removeExpiredRequests } from '../approval.js';
import { requireName, requirePhone, requireEmail, maskPhone } from '../validation.js';
import { limiter } from '../rateLimit.js';

// The admin dashboard: a web page (/admin) and the read-only numbers it shows (/admin/api).
// Only accounts with the 'admin' role can log in (npm run admin -- create-admin).

const here = path.dirname(fileURLToPath(import.meta.url));
export const adminPages = express.static(path.join(here, '..', '..', 'public', 'admin'), { index: 'index.html' });

export const adminRouter = Router();
// Only the CLI makes admins: an email address alone proves nothing, since sign-up never checks
// that the person owns the mailbox.
const isAdmin = (role) => role === 'admin';

const DAY = 86400000;
const WEEKS = 12;

adminRouter.post('/login', limiter('admin-login', 10), async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const [rows] = email
    ? await authDb.query("SELECT id, full_name, email, password_hash, role FROM users WHERE email = ? AND verification_status = 'verified'", [email])
    : [[]];
  const user = rows[0];
  const ok = user && await bcrypt.compare(password, user.password_hash);
  // One answer for every failure, so the page never tells who is an admin.
  if (!ok || !isAdmin(user.role)) throw unauthorized('invalid_credentials', 'Incorrect email or password, or this account is not an admin.');
  const token = await createSession(user.id);
  res.json({ token, name: user.full_name });
});

function requireAdmin(req, _res, next) {
  if (!isAdmin(req.auth?.role)) return next(forbidden('not_admin', 'This account is not an admin.'));
  next();
}
adminRouter.use(requireAuth, requireAdmin);

adminRouter.post('/logout', async (req, res) => {
  await revokeSession(req.auth.sessionId);
  res.json({ loggedOut: true });
});

const ms = (d) => (d ? new Date(d).getTime() : 0);
const iso = (d) => (d ? new Date(d).toISOString() : null);
// Monday of the week (India time) that a YYYY-MM-DD day falls in.
function weekOf(day) {
  const d = new Date(`${day}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * DAY).toISOString().slice(0, 10);
}
const dayStr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

async function lastActiveByUser() {
  const [rows] = await authDb.query(
    'SELECT user_id, MAX(COALESCE(last_used_at, created_at)) AS last FROM sessions GROUP BY user_id'
  );
  return new Map(rows.map((r) => [Number(r.user_id), r.last]));
}

async function visitsSince(days) {
  const from = indiaDate(Date.now() - days * DAY);
  const [rows] = await clientsDb.query(
    'SELECT user_id, client_id, visit_date FROM client_visits WHERE visit_date >= ?', [from]
  );
  return rows.map((r) => ({ user: Number(r.user_id), client: Number(r.client_id), day: dayStr(r.visit_date) }));
}

// Client ID shown to the admin: CW-C-0001.
const clientCode = (id) => `CW-C-${String(id).padStart(4, '0')}`;
const ACTIVE_ACCESS = 'revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())';

async function nurseNames(ids) {
  if (!ids.length) return new Map();
  const [rows] = await authDb.query('SELECT id, full_name, email FROM users WHERE id IN (?)', [ids]);
  return new Map(rows.map((r) => [Number(r.id), { name: r.full_name, email: r.email }]));
}

adminRouter.get('/overview', async (_req, res) => {
  await removeExpiredRequests();
  const [[users], [[fam]], [[bab]], [records], visits, lastActive] = await Promise.all([
    authDb.query("SELECT id, role, full_name, email, phone, created_at, approval_status FROM users WHERE verification_status = 'verified'"),
    clientsDb.query('SELECT COUNT(*) AS n FROM clients'),
    clientsDb.query('SELECT COUNT(*) AS n FROM babies'),
    clientsDb.query(
      `SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*) AS n FROM monitoring_records
        WHERE created_at > now() - make_interval(days => ?) GROUP BY day`, [WEEKS * 7 + 7]
    ),
    visitsSince(WEEKS * 7 + 7),
    lastActiveByUser(),
  ]);
  const parents = users.filter((u) => u.role === 'client');
  const now = Date.now();
  const activeIn = (days) => parents.filter((p) => now - ms(lastActive.get(Number(p.id))) < days * DAY).length;

  // The last 12 weeks, Monday to Sunday (India time), oldest first.
  const thisWeek = weekOf(indiaDate());
  const weeks = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    const start = new Date(new Date(`${thisWeek}T00:00:00Z`).getTime() - i * 7 * DAY).toISOString().slice(0, 10);
    weeks.push({ week: start, visits: 0, families: new Set(), nurses: new Set(), records: 0 });
  }
  const byWeek = new Map(weeks.map((w) => [w.week, w]));
  for (const v of visits) {
    const w = byWeek.get(weekOf(v.day));
    if (w) { w.visits += 1; w.families.add(v.client); w.nurses.add(v.user); }
  }
  for (const r of records) {
    const w = byWeek.get(weekOf(dayStr(r.day)));
    if (w) w.records += Number(r.n);
  }
  const out = weeks.map((w) => ({ week: w.week, visits: w.visits, families: w.families.size, nurses: w.nurses.size, records: w.records }));

  const [[pairs], [crashes]] = await Promise.all([
    clientsDb.query(`SELECT DISTINCT client_id, user_id FROM client_access WHERE ${ACTIVE_ACCESS}`),
    authDb.query('SELECT COUNT(*) AS n FROM crash_reports WHERE created_at > now() - make_interval(days => 7)'),
  ]);
  const assisted = new Set(pairs.map((p) => Number(p.client_id)));
  const [[newFamilies]] = await clientsDb.query('SELECT COUNT(*) AS n FROM clients WHERE created_at > now() - make_interval(days => 7)');

  res.json({
    care: { nurseAssisted: assisted.size, selfTracking: Math.max(0, Number(fam.n) - assisted.size) },
    assignedNurses: new Set(pairs.map((p) => Number(p.user_id))).size,
    pendingNurses: users.filter((u) => u.role === 'nurse' && u.approval_status === 'pending')
      .map((u) => ({
        id: Number(u.id), name: u.full_name, email: u.email, phone: u.phone, signedUp: iso(u.created_at),
        expires: new Date(ms(u.created_at) + config.approvalDays * DAY).toISOString(),
      })),
    approvalDays: config.approvalDays,
    alerts: { crashes7: Number(crashes[0].n), newFamilies7: Number(newFamilies.n) },
    totals: {
      // Play Store installs aren't visible to the server; every account made in the app is.
      appUsers: users.filter((u) => u.role === 'nurse' || u.role === 'client').length,
      nurses: users.filter((u) => u.role === 'nurse' && u.approval_status === 'approved').length,
      parents: parents.length,
      families: Number(fam.n),
      babies: Number(bab.n),
      activeParents7: activeIn(7),
      activeParents30: activeIn(30),
      visitsThisWeek: out[out.length - 1].visits,
      visitsLastWeek: out[out.length - 2].visits,
      recordsThisWeek: out[out.length - 1].records,
    },
    weeks: out,
    generatedAt: new Date().toISOString(),
  });
});

adminRouter.get('/nurses', async (_req, res) => {
  const [[nurses], [access], visits, lastActive] = await Promise.all([
    authDb.query("SELECT id, full_name, email, phone, created_at FROM users WHERE role = 'nurse' AND verification_status = 'verified'"),
    clientsDb.query('SELECT user_id, COUNT(*) AS n FROM client_access WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) GROUP BY user_id'),
    visitsSince(30),
    lastActiveByUser(),
  ]);
  const families = new Map(access.map((a) => [Number(a.user_id), Number(a.n)]));
  const week = indiaDate(Date.now() - 6 * DAY);
  res.json({
    nurses: nurses.map((n) => {
      const mine = visits.filter((v) => v.user === Number(n.id));
      return {
        id: n.id, name: n.full_name, email: n.email, phone: n.phone, joined: iso(n.created_at),
        lastActive: iso(lastActive.get(Number(n.id))),
        families: families.get(Number(n.id)) || 0,
        visits7: mine.filter((v) => v.day >= week).length,
        visits30: mine.length,
        lastVisit: mine.reduce((a, v) => (v.day > a ? v.day : a), '') || null,
      };
    }),
  });
});

adminRouter.get('/families', async (_req, res) => {
  const [[clients], [babies], [lastRec], [access], visits, [pairs], [babyRows]] = await Promise.all([
    clientsDb.query('SELECT id, name, phone, email, user_id, created_at FROM clients'),
    clientsDb.query('SELECT client_id, COUNT(*) AS n FROM babies GROUP BY client_id'),
    clientsDb.query('SELECT b.client_id, MAX(r.updated_at) AS last, COUNT(*) AS n FROM monitoring_records r JOIN babies b ON b.id = r.baby_id GROUP BY b.client_id'),
    clientsDb.query('SELECT client_id, COUNT(*) AS n FROM client_access WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) GROUP BY client_id'),
    visitsSince(30),
    clientsDb.query(`SELECT client_id, user_id FROM client_access WHERE ${ACTIVE_ACCESS}`),
    clientsDb.query('SELECT id, client_id, name FROM babies ORDER BY position DESC, created_at'),
  ]);
  const nurses = await nurseNames([...new Set(pairs.map((p) => Number(p.user_id)))]);
  const nursesOf = (cid) => pairs.filter((p) => Number(p.client_id) === cid)
    .map((p) => ({ id: Number(p.user_id), name: nurses.get(Number(p.user_id))?.name || `#${p.user_id}` }));
  const babiesOf = (cid) => babyRows.filter((b) => Number(b.client_id) === cid).map((b) => ({ id: b.id, name: b.name }));
  const parentIds = clients.map((c) => c.user_id).filter(Boolean);
  const [parents] = parentIds.length ? await authDb.query('SELECT id, email FROM users WHERE id IN (?)', [parentIds]) : [[]];
  const parentEmail = new Map(parents.map((p) => [Number(p.id), p.email]));
  const count = (rows) => new Map(rows.map((r) => [Number(r.client_id), r]));
  const b = count(babies); const l = count(lastRec); const a = count(access);
  res.json({
    families: clients.map((c) => ({
      id: c.id, code: clientCode(c.id), name: c.name, phone: c.phone, created: iso(c.created_at),
      babyList: babiesOf(Number(c.id)),
      assignedNurses: nursesOf(Number(c.id)),
      parentAccount: c.user_id ? parentEmail.get(Number(c.user_id)) || null : null,
      email: (c.user_id && parentEmail.get(Number(c.user_id))) || c.email || null,
      babies: Number(b.get(Number(c.id))?.n || 0),
      records: Number(l.get(Number(c.id))?.n || 0),
      lastRecord: iso(l.get(Number(c.id))?.last),
      nurses: Number(a.get(Number(c.id))?.n || 0),
      visits30: visits.filter((v) => v.client === Number(c.id)).length,
    })),
  });
});

adminRouter.get('/parents', async (_req, res) => {
  const [[parents], lastActive] = await Promise.all([
    authDb.query("SELECT id, full_name, email, phone, google_sub, created_at FROM users WHERE role = 'client' AND verification_status = 'verified'"),
    lastActiveByUser(),
  ]);
  const ids = parents.map((p) => p.id);
  const [[fams], [written]] = ids.length ? await Promise.all([
    clientsDb.query('SELECT c.user_id, c.name, (SELECT COUNT(*) FROM babies b WHERE b.client_id = c.id) AS babies FROM clients c WHERE c.user_id IN (?)', [ids]),
    clientsDb.query('SELECT updated_by, COUNT(*) AS n FROM monitoring_records WHERE updated_by IN (?) AND updated_at > now() - make_interval(days => 7) GROUP BY updated_by', [ids]),
  ]) : [[[]], [[]]];
  const fam = new Map(fams.map((f) => [Number(f.user_id), f]));
  const wrote = new Map(written.map((w) => [Number(w.updated_by), Number(w.n)]));
  const now = Date.now();
  res.json({
    parents: parents.map((p) => {
      const last = lastActive.get(Number(p.id));
      return {
        id: p.id, name: p.full_name, email: p.email, phone: p.phone, joined: iso(p.created_at),
        google: !!p.google_sub,
        family: fam.get(Number(p.id))?.name || null,
        babies: Number(fam.get(Number(p.id))?.babies || 0),
        lastActive: iso(last),
        active7: now - ms(last) < 7 * DAY,
        entries7: wrote.get(Number(p.id)) || 0,
      };
    }),
  });
});

// Which nurse can open which family (they entered the parent's code), with their latest work there.
adminRouter.get('/assignments', async (_req, res) => {
  const [[rows], visits] = await Promise.all([
    clientsDb.query(
      `SELECT a.user_id, a.client_id, a.granted_at, a.opened_at, c.name AS client_name,
              (SELECT MAX(r.updated_at) FROM monitoring_records r JOIN babies b ON b.id = r.baby_id
                WHERE b.client_id = a.client_id AND r.updated_by = a.user_id) AS last_entry
         FROM client_access a JOIN clients c ON c.id = a.client_id
        WHERE a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at > now())`
    ),
    visitsSince(30),
  ]);
  const nurses = await nurseNames([...new Set(rows.map((r) => Number(r.user_id)))]);
  res.json({
    assignments: rows.map((r) => ({
      nurseId: Number(r.user_id),
      nurse: nurses.get(Number(r.user_id))?.name || `#${r.user_id}`,
      nurseEmail: nurses.get(Number(r.user_id))?.email || '',
      clientId: Number(r.client_id),
      clientCode: clientCode(r.client_id),
      client: r.client_name,
      since: iso(r.granted_at),
      lastOpened: iso(r.opened_at),
      lastEntry: iso(r.last_entry),
      visits30: visits.filter((v) => v.user === Number(r.user_id) && v.client === Number(r.client_id)).length,
    })),
  });
});

// A baby's saved records, for the app's own monthly report built in the admin's browser.
adminRouter.get('/families/:id/babies/:babyId/records', async (req, res) => {
  const [[baby]] = await clientsDb.query(
    'SELECT id, name, details FROM babies WHERE id = ? AND client_id = ?', [req.params.babyId, Number(req.params.id)]
  );
  if (!baby) throw notFound('baby_not_found', 'Choose a baby of this family.');
  const [rows] = await clientsDb.query('SELECT record_type, data FROM monitoring_records WHERE baby_id = ? ORDER BY position DESC', [baby.id]);
  const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
  const records = {};
  for (const r of rows) (records[r.record_type] ||= []).push(parse(r.data));
  res.json({ baby: { ...(parse(baby.details) || {}), id: baby.id, name: baby.name }, records });
});

// Quick action: register a family (a nurse then opens it with the parent's emailed code).
adminRouter.post('/clients', async (req, res) => {
  const name = requireName(req.body?.name);
  const phone = requirePhone(req.body?.phone);
  const email = req.body?.email ? requireEmail(req.body.email) : null;
  try {
    const [r] = await clientsDb.query('INSERT INTO clients (name, phone, email, email_trusted) VALUES (?, ?, ?, ?) RETURNING id', [name, phone, email, !!email]);
    res.status(201).json({ id: r.insertId, code: clientCode(r.insertId), name, phoneMasked: maskPhone(phone) });
  } catch (err) {
    if (err.code === '23505') throw conflict('client_exists', 'A family with this phone number is already registered.');
    throw err;
  }
});

// Quick action: create a nurse account. The password is made here and shown to the admin once,
// to pass on to the nurse (who can change it in the app).
function newPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () => Array.from({ length: 4 }, () => abc[crypto.randomInt(abc.length)]).join('');
  return `${pick()}-${pick()}-${pick()}-${pick()}`;
}
adminRouter.post('/nurses', async (req, res) => {
  const name = requireName(req.body?.name);
  const email = requireEmail(req.body?.email);
  const phone = requirePhone(req.body?.phone);
  const [taken] = await authDb.query(
    "SELECT email, phone FROM users WHERE (email = ? OR phone = ?) AND verification_status = 'verified'", [email, phone]
  );
  if (taken.some((u) => u.email === email)) throw conflict('email_taken', 'An account with this email already exists.');
  if (taken.length) throw conflict('phone_taken', 'This phone number is already registered to another account.');
  await authDb.query("DELETE FROM users WHERE (email = ? OR phone = ?) AND verification_status <> 'verified'", [email, phone]);
  const password = newPassword();
  const hash = await bcrypt.hash(password, config.bcryptRounds);
  const [r] = await authDb.query(
    `INSERT INTO users (full_name, phone, email, password_hash, verification_status, verified_at, role)
     VALUES (?, ?, ?, ?, 'verified', now(), 'nurse') RETURNING id`, [name, phone, email, hash]
  );
  res.status(201).json({ id: r.insertId, name, email, password });
});

// Approve or reject a nurse who signed up in the app. The nurse is told by email; if the email
// can't be sent the decision still stands (they see it when they next log in).
const DECISION_EMAIL = {
  approved: (name) => ({
    subject: 'Your Cradlewell nurse account is approved',
    text: `Hello ${name},\n\nYour nurse account has been approved. You can now log in to the Cradlewell app.\n\nCradlewell · care@cradlewell.com`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1B1F2E">
  <h2 style="color:#5F47FF;margin:0 0 12px">You're approved</h2>
  <p>Hello ${escapeHtml(name)},</p>
  <p>Your nurse account has been approved. You can now log in to the Cradlewell app.</p>
  <p style="color:#5A6690;font-size:13px">Cradlewell · care@cradlewell.com</p>
</div>`,
  }),
  rejected: (name) => ({
    subject: 'About your Cradlewell nurse account',
    text: `Hello ${name},\n\nWe could not approve your nurse account in the Cradlewell app. If you think this is a mistake, write to us at care@cradlewell.com.\n\nCradlewell`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1B1F2E">
  <h2 style="color:#5F47FF;margin:0 0 12px">About your nurse account</h2>
  <p>Hello ${escapeHtml(name)},</p>
  <p>We could not approve your nurse account in the Cradlewell app. If you think this is a mistake, write to us at care@cradlewell.com.</p>
  <p style="color:#5A6690;font-size:13px">Cradlewell</p>
</div>`,
  }),
};
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

for (const [action, status] of [['approve', 'approved'], ['reject', 'rejected']]) {
  adminRouter.post(`/nurses/:id/${action}`, async (req, res) => {
    const id = Number(req.params.id);
    const [[nurse]] = await authDb.query(
      "SELECT id, full_name, email FROM users WHERE id = ? AND role = 'nurse' AND approval_status = 'pending'", [id]
    );
    if (!nurse) throw notFound('nurse_not_pending', 'This nurse is not waiting for approval any more. Refresh the page.');
    await authDb.query('UPDATE users SET approval_status = ? WHERE id = ?', [status, id]);
    let emailed = true;
    try {
      await sendEmail(nurse.email, DECISION_EMAIL[status](nurse.full_name));
    } catch (_) {
      emailed = false;
    }
    res.json({ id, status, emailed });
  });
}

