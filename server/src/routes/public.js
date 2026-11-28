import { Router } from 'express';
import { authDb } from '../db.js';
import { limiter } from '../rateLimit.js';

// Public, no login: the web pages Google Play links to (privacy policy, account deletion) and the
// app's crash reports.
export const publicRouter = Router();

const APP = 'Cradlewell Baby Tracker';
const SUPPORT = 'care@cradlewell.com';
const UPDATED = '27 November 2026';

// Keep in step with the in-app copy (src/screens/AboutScreen.js, POLICY).
const POLICY = [
  ['Who we are', `${APP} ("the app", "we") helps parents and nurses record a baby's daily care and share reports with the baby's doctor. Questions about this policy: ${SUPPORT}.`],
  ['What we collect', [
    'Account details: your name, email address, phone number and whether you are a parent or a nurse. Your password is stored only in a scrambled (hashed) form that cannot be read back.',
    "Baby details you enter: name, date of birth, gender and birth weight.",
    'Care records you enter: feeds, sleep, diapers, medicines and doses, vaccines, growth, temperature, breathing, skin checks and milestones.',
    'Error reports: when the app fails, it sends what went wrong, the screen and the app version, so we can fix it. They contain no name, email or baby data and are deleted after 90 days.',
  ]],
  ['How we use it', [
    'To show your records, charts, alerts and reminders in the app and to create PDF reports.',
    'To keep your records in step between the phones you and your care team use.',
    "To send one-time codes by email: to confirm a nurse may open a family's records, and to reset a password.",
    'We do not sell your data, show advertising, or use it for marketing.',
  ]],
  ['Where it is kept', [
    "Your records are stored on Cradlewell's server and a copy is kept on your phone so the app works offline.",
    'Data is sent to the server over an encrypted connection.',
    'Medicine and vaccine reminders, your app lock PIN and your notification settings stay on your phone only.',
  ]],
  ['Who can see it', [
    "A nurse can open a family's records only after the parent gives them a one-time code sent to the parent's email.",
    'PDF reports are created on your phone; they are shared only when you choose to send them.',
    'We share data with nobody else, unless the law requires it.',
  ]],
  ['How long we keep it', [
    "Records are kept while your account is open. Deleting a baby profile in Settings deletes that baby's records.",
    'You can delete your account in the app: Profile → Account → Delete account. For a parent this deletes the account, the babies and all their records at once. For a nurse it deletes the account and their access to families; the families keep their records.',
    `Can't open the app? Email ${SUPPORT} from the address you signed up with and we delete the account within 30 days.`,
  ]],
  ['Your choices', [
    'You can view, change and delete the records you entered at any time.',
    'You can turn notifications on or off in Settings and in your phone settings.',
    'You can ask us for a copy of your data or to correct it.',
  ]],
  ['Children', ['The app is for parents and carers, not for children to use. The records about a baby are entered and controlled by the parent or carer.']],
  ['Changes', ['If this policy changes, we update it here and change the date at the top.']],
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(title, bodyHtml) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${APP}</title>
<style>
  :root { --bg:#F7F6FD; --card:#fff; --text:#1B1F2E; --muted:#5A6690; --brand:#5B4BB7; --line:#E6E8F5; }
  @media (prefers-color-scheme: dark) { :root { --bg:#12142A; --card:#1B1E38; --text:#EEF0FA; --muted:#A9B0D3; --brand:#A99BFF; --line:#2A2E52; } }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  main { max-width:720px; margin:0 auto; padding:32px 16px 64px; }
  h1 { font-size:28px; line-height:1.2; margin:0 0 4px; } .date { color:var(--muted); margin:0 0 24px; }
  section { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:20px; margin-bottom:12px; }
  h2 { font-size:18px; margin:0 0 8px; } p, li { color:var(--muted); margin:6px 0; } ul { padding-left:20px; margin:0; }
  a { color:var(--brand); font-weight:600; } ol li { margin:8px 0; } .brand { color:var(--brand); font-weight:800; letter-spacing:.2px; }
</style></head>
<body><main><p class="brand">${APP}</p>${bodyHtml}</main></body></html>`;
}

publicRouter.get('/privacy', (_req, res) => {
  const sections = POLICY.map(([h, b]) => `<section><h2>${esc(h)}</h2>${
    Array.isArray(b) ? `<ul>${b.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p>${esc(b)}</p>`}</section>`).join('');
  res.type('html').send(page('Privacy policy', `<h1>Privacy policy</h1><p class="date">Last updated ${UPDATED}</p>${sections}`));
});

publicRouter.get('/delete-account', (_req, res) => {
  res.type('html').send(page('Delete your account', `
<h1>Delete your account</h1><p class="date">${APP}</p>
<section><h2>In the app</h2><ol>
  <li>Open ${APP} and log in.</li>
  <li>Go to <b>Profile → Account → Delete account</b>.</li>
  <li>Type <b>DELETE</b>, enter your password (not needed if you sign in with Google) and confirm.</li>
</ol><p>The account is deleted straight away.</p></section>
<section><h2>What is deleted</h2><ul>
  <li><b>Parent account:</b> your account, your family record, every baby profile and every care record (feeds, sleep, diapers, medicines, vaccines, growth and health checks). Nurses lose access at once.</li>
  <li><b>Nurse account:</b> your account and your access to families. The care records you entered belong to the families and stay with them.</li>
  <li>Error reports hold no personal data and are deleted after 90 days.</li>
</ul></section>
<section><h2>Can't open the app?</h2><p>Email <a href="mailto:${SUPPORT}?subject=Delete%20my%20account">${SUPPORT}</a> from the address you signed up with, with the subject "Delete my account". We delete the account and its data within 30 days and reply when it is done.</p></section>`));
});

// Crash reports from the app. No login needed (an app can fail before login); no user is stored.
const clip = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : null);
let lastCleanup = 0;
publicRouter.post('/crash', limiter('crash', 30), async (req, res) => {
  const b = req.body || {};
  const message = clip(b.message, 500);
  if (!message) return res.status(400).json({ error: { code: 'invalid_body', message: 'message is required.' } });
  await authDb.query(
    'INSERT INTO crash_reports (message, stack, is_fatal, app_version, platform, screen) VALUES (?, ?, ?, ?, ?, ?)',
    [message, clip(b.stack, 8000), !!b.fatal, clip(b.appVersion, 20), clip(b.platform, 40), clip(b.screen, 60)]
  );
  if (Date.now() - lastCleanup > 24 * 3600e3) {
    lastCleanup = Date.now();
    authDb.query('DELETE FROM crash_reports WHERE created_at < now() - make_interval(days => 90)').catch(() => {});
  }
  res.status(204).end();
});
