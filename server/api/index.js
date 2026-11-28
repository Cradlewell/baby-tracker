// Vercel entry: the same Express app as src/index.js, run as one serverless function.
// src/index.js (npm start) is still how the server runs anywhere else.
import express from 'express';
import { createApp } from '../src/app.js';
import { authDb } from '../src/db.js';

const root = express();
root.disable('x-powered-by');

// The daily cleanup src/index.js runs on a timer; on Vercel a cron job calls this once a day.
root.get('/api/cron/tidy', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.get('authorization') !== `Bearer ${secret}`) {
    return res.status(401).json({ error: { code: 'unauthorized', message: 'Unauthorized.' } });
  }
  await Promise.all([
    authDb.query('DELETE FROM sessions WHERE COALESCE(revoked_at, expires_at) < now() - make_interval(days => 90)'),
    authDb.query('DELETE FROM otp_codes WHERE created_at < now() - make_interval(days => 7)'),
  ]);
  res.json({ ok: true });
});

root.use(createApp());

export default root;
