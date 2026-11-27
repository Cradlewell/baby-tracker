import { authDb } from './db.js';
import { config } from './config.js';
import { sendEmail } from './email.js';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const expiredEmail = (name, days) => ({
  subject: 'Your Cradlewell nurse sign-up has expired',
  text: `Hello ${name},\n\nYour request to join Cradlewell as a nurse was not approved within ${days} days, so it has been removed. You're welcome to sign up again in the app.\n\nQuestions? Write to care@cradlewell.com.\n\nCradlewell`,
  html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1B1F2E">
  <h2 style="color:#5F47FF;margin:0 0 12px">Your sign-up has expired</h2>
  <p>Hello ${escapeHtml(name)},</p>
  <p>Your request to join Cradlewell as a nurse was not approved within ${days} days, so it has been removed. You're welcome to sign up again in the app.</p>
  <p style="color:#5A6690;font-size:13px">Questions? Write to care@cradlewell.com. · Cradlewell</p>
</div>`,
});

// Nurse sign-ups nobody approved or rejected within config.approvalDays are removed, and the
// nurse is told by email (best effort) so they can sign up again. Called before anything that
// reads or checks pending nurses, so no background job is needed.
export async function removeExpiredRequests() {
  const days = config.approvalDays;
  const [rows] = await authDb.query(
    `SELECT id, full_name, email FROM users
      WHERE role = 'nurse' AND approval_status = 'pending' AND created_at < UTC_TIMESTAMP() - INTERVAL ? DAY`, [days]
  );
  if (!rows.length) return 0;
  const [r] = await authDb.query(
    "DELETE FROM users WHERE id IN (?) AND role = 'nurse' AND approval_status = 'pending'", [rows.map((u) => u.id)]
  );
  await Promise.all(rows.map((u) => sendEmail(u.email, expiredEmail(u.full_name, days)).catch(() => {})));
  return r.affectedRows;
}
