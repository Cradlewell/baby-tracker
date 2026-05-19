import { getDeviceId } from './deviceId';

// Paste your deployed Apps Script Web App URL here
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbysVj0ZEaBN342fZ6zp55V7c_rYchI9U3xqBYJRuLrF3f41qzP0vH8J5CQeM393j6v_ig/exec';

export async function syncToSheets(table, data) {
  try {
    const deviceId = await getDeviceId();
    const body = JSON.stringify({ table, data: { ...data, device_id: deviceId } });
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
    });
    const text = await res.text();
    console.log('[sheets]', table, text);
  } catch (err) {
    console.warn('[sheets] error', err.message);
  }
}
