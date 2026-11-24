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

async function shutdown() {
  server.close();
  await closePools().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
