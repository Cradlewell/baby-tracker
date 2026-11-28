import { config } from './config.js';
import { ApiError } from './errors.js';

// No real SMS sender is connected: texts are only printed (console, development) or kept in
// memory (the tests). Production refuses every setting that would need SMS (see config.js).

// Messages kept by the "memory" provider, which the automated tests read.
export const memoryOutbox = [];

// Sends a text message. Throws an ApiError the app can show if delivery fails.
export async function sendSms(to, body) {
  try {
    switch (config.sms.provider) {
      case 'memory':
        memoryOutbox.push({ to, body, at: Date.now() });
        return;
      case 'console':
        // Development only (refused when NODE_ENV=production): lets you test without an SMS account.
        console.log(`[SMS dev mode] to ${to}: ${body}`);
        return;
      default:
        throw new Error(`Unknown SMS_PROVIDER "${config.sms.provider}"`);
    }
  } catch (err) {
    console.error('SMS delivery failed:', err.message);
    throw new ApiError(502, 'sms_failed', 'We could not send the SMS. Please try again in a moment.');
  }
}
