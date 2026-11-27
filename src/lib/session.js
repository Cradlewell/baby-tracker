import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, setApiToken, isNetworkError } from './api';
import { setRemoteClient, clearClientCache, clearAllClientData, flushPending } from './storage';
import * as FileSystem from 'expo-file-system/legacy';
import { resetInMemoryState } from './dataReset';
import { cancelAllReminders, cancelTimerReminders } from './reminders';
import { useAuthStore } from '../store/useAuthStore';
import { useBabyStore } from '../store/useBabyStore';
import { useFeedingStore } from '../store/useFeedingStore';
import { useSleepStore } from '../store/useSleepStore';
import { useSettingsStore } from '../store/useSettingsStore';

const TOKEN_KEY = 'cw_session_token';
// Non-secret copy of the user and client names, so the app can open offline.
const PROFILE_KEY = '@cw_auth_profile';

// The session token lives in the Keychain (iOS) / Keystore (Android). The web build has no
// secure store, so it falls back to browser storage there.
const tokenStore = Platform.OS === 'web'
  ? {
    get: () => AsyncStorage.getItem(TOKEN_KEY),
    set: (v) => AsyncStorage.setItem(TOKEN_KEY, v),
    remove: () => AsyncStorage.removeItem(TOKEN_KEY),
  }
  : {
    get: () => SecureStore.getItemAsync(TOKEN_KEY),
    set: (v) => SecureStore.setItemAsync(TOKEN_KEY, v),
    remove: () => SecureStore.deleteItemAsync(TOKEN_KEY),
  };

const setAuth = (patch) => useAuthStore.getState().setAuth(patch);

async function saveProfile(user, client) {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify({ user, client })).catch(() => {});
}

function applyState(user, client) {
  setRemoteClient(client ? client.id : null);
  const status = !user ? 'signedOut' : client ? 'ready' : 'needsClient';
  setAuth({ status, user, client });
  return status;
}

// Resumes the saved session. Returns { status: 'signedOut' | 'needsClient' | 'ready', offline }.
async function restoreSession() {
  const token = await tokenStore.get().catch(() => null);
  if (!token) return { status: applyState(null, null), offline: false };
  setApiToken(token);
  try {
    const { user, client } = await api.get('/auth/me');
    await saveProfile(user, client);
    return { status: applyState(user, client), offline: false };
  } catch (err) {
    if (isNetworkError(err)) {
      // Offline: open with the last known profile; data comes from this phone's cache.
      const saved = JSON.parse((await AsyncStorage.getItem(PROFILE_KEY)) || 'null');
      if (saved?.user) return { status: applyState(saved.user, saved.client), offline: true };
    }
    await endLocalSession();
    return { status: 'signedOut', offline: false };
  }
}

// On app start: everyone stays logged in (30 days from login) and reopens where they were. A
// nurse goes straight back to the family they last had open, without the phone number or a code,
// while their access to that family is active; the server leaves it out of /auth/me otherwise,
// and the nurse is asked for the number. Offline, the last family opens from the phone's copy.
// Returns 'signedOut' | 'needsClient' | 'ready'.
export async function startSession() {
  const { status, offline } = await restoreSession();
  if (status === 'ready' && !offline) flushPending().catch(() => {});
  return status;
}

// ---- Registration -----------------------------------------------------------

export const register = (form) => api.post('/auth/register', form, { auth: false });
export const resendRegistrationOtp = (email) => api.post('/auth/register/resend', { email }, { auth: false });
export const verifyRegistrationOtp = (email, otp) => api.post('/auth/register/verify', { email, otp }, { auth: false });

// ---- Login ------------------------------------------------------------------

// role: 'nurse' (then asks for a client's phone number) or 'client' (a parent: the server opens
// their own records at once). Returns 'needsClient' or 'ready'.
const LAST_LOGIN_KEY = '@cw_last_login';

export async function login(email, password, role = 'nurse') {
  const status = await finishLogin(await api.post('/auth/login', { email, password, role }, { auth: false }));
  // Remembered on this phone so the login page is filled in next time (the password never is).
  await AsyncStorage.setItem(LAST_LOGIN_KEY, JSON.stringify({ email: email.trim().toLowerCase(), role })).catch(() => {});
  return status;
}

// The email and role last used to log in on this phone: { email, role } or null.
export async function lastLogin() {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(LAST_LOGIN_KEY)) || 'null');
    return v?.email ? v : null;
  } catch (_) {
    return null;
  }
}

// Forgot password: emails a 6-digit code, then sets the new password with it.
export const forgotPassword = (email) => api.post('/auth/password/forgot', { email }, { auth: false });
export const resetPassword = (email, otp, newPassword, confirmPassword) =>
  api.post('/auth/password/reset', { email, otp, newPassword, confirmPassword }, { auth: false });

// Deletes this account on the server (password needed unless it signs in with Google), then
// everything this phone kept for it.
export async function deleteAccount(password) {
  await api.post('/auth/account/delete', { confirm: 'DELETE', ...(password ? { password } : {}) });
  await endLocalSession();
}

// Families this nurse has already verified (open without a code), most recent first.
export async function myClients() {
  const { clients } = await api.get('/client/mine');
  return clients || [];
}

// Continue with Google. An existing account signs in: resolves { status }. A new person gets
// { needsSignup, signupToken, fullName, email } and is asked for a phone number next.
export async function googleLogin(idToken, role = 'nurse') {
  const res = await api.post('/auth/google', { idToken, role }, { auth: false });
  if (res.needsSignup) return res;
  return { status: await finishLogin(res) };
}

// The phone-number step for a new Google user: saves the phone, signs in, resolves { status }.
// Returns { status } when signed in, or { otpRequired, phoneMasked, expiresInSeconds } when the
// phone number already belongs to a family and must be proven with an SMS code first.
export async function completeGoogleSignup({ signupToken, phone, role, fullName }) {
  const res = await api.post('/auth/google/signup', { signupToken, phone, role, fullName }, { auth: false });
  if (res.otpRequired || res.approvalPending) return res;
  return { status: await finishLogin(res) };
}

// The SMS code for a Google sign-up: activates the account and signs in. Returns the status.
export async function verifyGoogleSignupOtp(signupToken, otp) {
  const res = await api.post('/auth/google/signup/verify', { signupToken, otp }, { auth: false });
  return finishLogin(res);
}

// Stores the session from a login response. Returns 'needsClient' or 'ready'.
async function finishLogin({ token, user, client }) {
  // The login page was reached with Back while still logged in: end that login first.
  const { status } = useAuthStore.getState();
  if (status === 'needsClient' || status === 'ready') await logout();
  await tokenStore.set(token);
  setApiToken(token);
  if (client) {
    applyState(user, null);
    await openClient(client);
    return 'ready';
  }
  await saveProfile(user, null);
  return applyState(user, null);
}

export const isClientAccount = (user) => user?.role === 'client';

// ---- Client verification ----------------------------------------------------

// Looks up the client by phone. When codes are switched off on the server, the client is
// opened immediately and { otpRequired: false, client } is returned.
// `email`: the parent's email, needed only when the family has none on file yet.
export async function requestClientOtp(phone, email) {
  const res = await api.post('/client/request-otp', { phone, ...(email ? { email } : {}) });
  if (res.otpRequired === false) await openClient(res.client);
  return res;
}

// Creates a new client for a phone number nobody has registered yet; the logged-in user is
// authorized for it automatically.
export async function createClient(name, phone, email) {
  const res = await api.post('/client', { name, phone, ...(email ? { email } : {}) });
  if (res.otpRequired === false) await openClient(res.client);
  return res;
}

export async function verifyClientOtp(phone, otp) {
  const { client } = await api.post('/client/verify-otp', { phone, otp });
  return openClient(client);
}

async function openClient(client) {
  const { user, client: current } = useAuthStore.getState();
  // Switching from another client (still open while the nurse picked this one): drop its copy.
  if (current && String(current.id) !== String(client.id)) await leaveLocalClient(current);
  resetInMemoryState();
  await saveProfile(user, client);
  applyState(user, client);
  await loadClientData();
  return client;
}

// Loads the verified client's babies, restores running timers, and sends offline changes.
export async function loadClientData() {
  // Babies first: only this client's babies get their running timers back.
  await useBabyStore.getState().load();
  const babyIds = useBabyStore.getState().babies.map((b) => b.id);
  await Promise.all([
    useFeedingStore.getState().restoreSession(babyIds),
    useSleepStore.getState().restoreSession(babyIds),
  ]);
  flushPending().catch(() => {});
}

// ---- Logout / switching client ----------------------------------------------

// This phone's side of leaving a client: its cached records, running timers and their alarms.
async function leaveLocalClient(client) {
  await clearClientCache(client.id);
  await clearRunningTimers();
  await cancelTimerReminders().catch(() => {});
}

async function clearRunningTimers() {
  await AsyncStorage.multiRemove(['@cw_feeding_session', '@cw_sleep_session']).catch(() => {});
}

// Saved PDF reports and the printer's temporary copies: they hold a baby's records.
async function deleteReportFiles() {
  const dirs = [
    FileSystem.documentDirectory && `${FileSystem.documentDirectory}reports/`,
    FileSystem.cacheDirectory && `${FileSystem.cacheDirectory}Print/`,
  ].filter(Boolean);
  await Promise.all(dirs.map((d) => FileSystem.deleteAsync(d, { idempotent: true }).catch(() => {})));
}

// What this phone keeps about the families it opened (shown babies, read alerts, vaccine
// reminder switches): removed so the next person on a shared phone sees none of it.
const FAMILY_KEYS = ['@cradlewell_active', '@cradlewell_notif_read', '@cw_reminder_items', '@cw_reminder_ids'];

async function endLocalSession() {
  // Every family's copy, not only the one open now: a nurse may log out from "choose client",
  // or after the login expired, when no family is open.
  await clearAllClientData().catch(() => {});
  await clearRunningTimers();
  await deleteReportFiles();
  // A logged-out phone should not keep ringing for clients' medicines and vaccines.
  await cancelAllReminders();
  // The PIN belonged to whoever was logged in; the next person sets their own.
  await useSettingsStore.getState().disableLock();
  await tokenStore.remove().catch(() => {});
  await AsyncStorage.removeItem(PROFILE_KEY).catch(() => {});
  const keys = await AsyncStorage.getAllKeys().catch(() => []);
  const family = keys.filter((k) => FAMILY_KEYS.includes(k) || k.startsWith('@cw_vacc_reminders_on_'));
  if (family.length) await AsyncStorage.multiRemove(family).catch(() => {});
  setApiToken(null);
  resetInMemoryState();
  applyState(null, null);
}

// Change password (logged in). The other phones on this account are signed out by the server.
export const changePassword = (currentPassword, newPassword, confirmPassword) =>
  api.post('/auth/password', { currentPassword, newPassword, confirmPassword });

export async function logout() {
  // Upload anything saved offline first: logging out removes this phone's copy.
  await flushPending().catch(() => {});
  await api.post('/auth/logout').catch(() => {});
  await endLocalSession();
}

// Leaves the current client but stays logged in, to verify a different client.
export async function switchClient() {
  const { user, client } = useAuthStore.getState();
  await api.post('/client/leave').catch(() => {});
  await clearClientCache(client?.id);
  await clearRunningTimers();
  // The timers are gone, so their 3-hour / 10-hour alarms must not ring. Medicine and vaccine
  // reminders stay: they are real dates for that client's baby.
  await cancelTimerReminders().catch(() => {});
  resetInMemoryState();
  await saveProfile(user, null);
  applyState(user, null);
}

// Called when the server rejects the session (expired, logged out elsewhere) or the
// client access was revoked. Returns where the app should go next.
export async function handleSessionLost(err) {
  if (err.status === 401 || isClientAccount(useAuthStore.getState().user)) {
    await endLocalSession();
    return 'Login';
  }
  await switchClient();
  return 'ClientVerify';
}
