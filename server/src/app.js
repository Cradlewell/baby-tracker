import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { clientRouter } from './routes/client.js';
import { dataRouter } from './routes/data.js';
import { errorHandler } from './errors.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  // The mobile app does not need CORS; only list origins for the web build (CORS_ORIGINS).
  if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '5mb' }));
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authRouter);
  app.use('/client', clientRouter);
  app.use('/data', dataRouter);

  app.use((_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } }));
  app.use(errorHandler);
  return app;
}
