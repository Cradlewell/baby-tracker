import { config } from './config.js';
import { ApiError } from './errors.js';

// Messages kept by the "memory" provider, which the automated tests read.
export const memoryOutbox = [];

async function sendWithTwilio(to, body) {
  const { accountSid, authToken, from, messagingServiceSid } = config.sms.twilio;
  if (!accountSid || !authToken || !(from || messagingServiceSid)) {
    throw new Error('Twilio is selected but TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER (or TWILIO_MESSAGING_SERVICE_SID) are not all set');
  }
  const params = new URLSearchParams({ To: to, Body: body });
  if (messagingServiceSid) params.set('MessagingServiceSid', messagingServiceSid);
  else params.set('From', from);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Twilio returned ${res.status}: ${detail.slice(0, 300)}`);
  }
}

// Sends a text message. Throws an ApiError the app can show if delivery fails.
export async function sendSms(to, body) {
  try {
    switch (config.sms.provider) {
      case 'twilio':
        await sendWithTwilio(to, body);
        return;
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
