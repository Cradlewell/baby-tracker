import { Platform } from 'react-native';
import { API_URL } from './api';
import { APP_VERSION } from '../constants/app';

/**
 * Crash reporting to Cradlewell's own server (POST /crash). Only what failed, where and the app
 * version is sent: never a name, email or baby data. Reports are kept 90 days; see them with
 * `npm run admin -- list-crashes` in the server folder.
 */

let currentScreen = null;
let sentThisSession = 0;
const recent = new Set();
const MAX_PER_SESSION = 20;

// The screen in view, so a report says where it happened (set by the navigator).
export function setCrashScreen(name) {
  currentScreen = name || null;
}

export function reportError(error, { fatal = false } = {}) {
  try {
    const message = String(error?.message || error || 'Unknown error').slice(0, 500);
    const stack = String(error?.stack || '').slice(0, 8000);
    // The same error over and over (in a render loop) is sent once.
    const key = `${message}|${stack.slice(0, 200)}`;
    if (recent.has(key) || sentThisSession >= MAX_PER_SESSION) return;
    recent.add(key);
    sentThisSession += 1;
    fetch(`${API_URL}/crash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        stack,
        fatal,
        appVersion: APP_VERSION,
        platform: `${Platform.OS} ${Platform.Version}${__DEV__ ? ' (dev)' : ''}`,
        screen: currentScreen,
      }),
    }).catch(() => {});
  } catch (_) {
    // Reporting must never cause a second failure.
  }
}

// Catches errors nothing else caught (they would close the app) and reports them first.
export function installCrashReporter() {
  const g = globalThis.ErrorUtils;
  if (!g?.setGlobalHandler || g.__cradlewellInstalled) return;
  const previous = g.getGlobalHandler?.();
  g.setGlobalHandler((error, isFatal) => {
    reportError(error, { fatal: !!isFatal });
    if (previous) previous(error, isFatal);
  });
  g.__cradlewellInstalled = true;
}
