import rateLimit from 'express-rate-limit';
import { config } from './config.js';

// Per-IP limits on endpoints that send SMS, check codes or check passwords,
// to slow down brute force and SMS abuse. Each call creates its own counter;
// `name` only documents what is limited.
export function limiter(name, max, windowMinutes = 15) {
  if (!config.rateLimit) return (_req, _res, next) => next();
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({
      error: { code: 'rate_limited', message: 'Too many attempts. Please wait a few minutes and try again.' },
    }),
  });
}
