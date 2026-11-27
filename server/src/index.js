import { createApp } from './app.js';
import { config } from './config.js';
import { authDb, clientsDb, closePools } from './db.js';

// Fail fast if either database is unreachable or the credentials are wrong.
await Promise.all([authDb.query('SELECT 1'), clientsDb.query('SELECT 1')]);

const server = createApp().listen(config.port, () => {
  console.log(`Cradlewell Bloom API listening on port ${config.port} (${config.env}, SMS: ${config.sms.provider})`);
  if (config.env === 'production') return;
  console.log('Development mode: use HTTPS behind a reverse proxy before handling real users.');
});

// Once a day: drop logins that ended over 90 days ago (the dashboard's activity counts look back
// 30 days at most) and codes older than a week (the daily code limit looks back 1 day).
const tidy = () => Promise.all([
  authDb.query('DELETE FROM sessions WHERE COALESCE(revoked_at, expires_at) < now() - make_interval(days => 90)'),
  authDb.query('DELETE FROM otp_codes WHERE created_at < now() - make_interval(days => 7)'),
]).catch((err) => console.error('Daily cleanup failed:', err.message));
tidy();
setInterval(tidy, 24 * 60 * 60 * 1000).unref();

async function shutdown() {
  server.close();
  await closePools().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
