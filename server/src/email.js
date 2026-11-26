import nodemailer from 'nodemailer';
import { config } from './config.js';
import { ApiError } from './errors.js';

// Emails kept by the "memory" provider, which the automated tests read.
export const memoryMailbox = [];

let transport = null;
function smtp() {
  const { host, port, secure, user, pass } = config.email.smtp;
  if (!host || !user || !pass) {
    throw new Error('SMTP is selected but SMTP_HOST, SMTP_USER and SMTP_PASSWORD are not all set');
  }
  transport ??= nodemailer.createTransport({
    host, port, secure, auth: { user, pass },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  return transport;
}

// Sends an email. Throws an ApiError the app can show if delivery fails.
export async function sendEmail(to, { subject, text, html }) {
  try {
    switch (config.email.provider) {
      case 'smtp':
        await smtp().sendMail({ from: config.email.from, to, subject, text, html });
        return;
      case 'memory':
        memoryMailbox.push({ to, subject, text, at: Date.now() });
        return;
      case 'console':
        // Development only (refused when NODE_ENV=production): lets you test without a mailbox.
        console.log(`[Email dev mode] to ${to}: ${subject}\n${text}`);
        return;
      default:
        throw new Error(`Unknown EMAIL_PROVIDER "${config.email.provider}"`);
    }
  } catch (err) {
    console.error('Email delivery failed:', err.message);
    throw new ApiError(502, 'email_failed', 'We could not send the email. Please try again in a moment.');
  }
}
