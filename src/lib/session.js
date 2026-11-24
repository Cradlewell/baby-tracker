import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, setApiToken, isNetworkError } from './api';
import { setRemoteClient, clearClientCache, flushPending } from './storage';
import { resetInMemoryState } from './dataReset';
import { cancelAllReminders } from './reminders';
import { useAuthStore } from '../store/useAuthStore';
import { useBabyStore } from '../store/useBabyStore';
import { useFeedingStore } from '../store/useFeedingStore';
import { useSleepStore } from '../store/useSleepStore';

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

// On app start: the nurse stays logged in, but is asked for the client's phone number every
// time, since one nurse serves many clients. Changes saved offline for the last client are
// uploaded first. Offline, the client can't be looked up, so the last client opens from the
// phone's copy instead. Returns 'signedOut' | 'needsClient' | 'ready'.
export async function startSession() {
  const { status, offline } = await restoreSession();
  if (status !== 'ready' || offline) return status;
  const { user } = useAuthStore.getState();
  // A client (parent) account always reopens its own records.
  if (isClientAccount(user)) return status;
  await flushPending().catch(() => {});
  await api.post('/client/leave').catch(() => {});
  // The cached copy is kept: anything still not uploaded is sent when this client is opened again.
  await saveProfile(user, null);
  return applyState(user, null);
}

// ---- Registration -----------------------------------------------------------

export const register = (form) => api.post('/auth/register', form, { auth: false });
export const resendRegistrationOtp = (email) => api.post('/auth/register/resend', { email }, { auth: false });
export const verifyRegistrationOtp = (email, otp) => api.post('/auth/register/verify', { email, otp }, { auth: false });

// ---- Login ------------------------------------------------------------------

// role: 'nurse' (then asks for a client's phone number) or 'client' (a parent: the server opens
// their own records at once). Returns 'needsClient' or 'ready'.
export async function login(email, password, role = 'nurse') {
  const { token, user, client } = await api.post('/auth/login', { email, password, role }, { auth: false });
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
export async function requestClientOtp(phone) {
  const res = await api.post('/client/request-otp', { phone });
  if (res.otpRequired === false) await openClient(res.client);
  return res;
}

// Creates a new client for a phone number nobody has registered yet; the logged-in user is
// authorized for it automatically.
export async function createClient(name, phone) {
  const res = await api.post('/client', { name, phone });
  if (res.otpRequired === false) await openClient(res.client);
  return res;
}

export async function verifyClientOtp(phone, otp) {
  const { client } = await api.post('/client/verify-otp', { phone, otp });
  return openClient(client);
}

async function openClient(client) {
  const { user } = useAuthStore.getState();
  resetInMemoryState();
  await saveProfile(user, client);
  applyState(user, client);
  await loadClientData();
  return client;
}

// Loads the verified client's babies, restores running timers, and sends offline changes.
export async function loadClientData() {
  await Promise.all([
    useBabyStore.getState().load(),
    useFeedingStore.getState().restoreSession(),
    useSleepStore.getState().restoreSession(),
  ]);
  flushPending().catch(() => {});
}

// ---- Logout / switching client ----------------------------------------------

async function clearRunningTimers() {
  await AsyncStorage.multiRemove(['@cw_feeding_session', '@cw_sleep_session']).catch(() => {});
}

async function endLocalSession() {
  const { client } = useAuthStore.getState();
  await clearClientCache(client?.id);
  await clearRunningTimers();
  // A logged-out phone should not keep ringing for clients' medicines and vaccines.
  await cancelAllReminders();
  await tokenStore.remove().catch(() => {});
  await AsyncStorage.removeItem(PROFILE_KEY).catch(() => {});
  setApiToken(null);
  resetInMemoryState();
  applyState(null, null);
}

export async function logout() {
  await api.post('/auth/logout').catch(() => {});
  await endLocalSession();
}

// Leaves the current client but stays logged in, to verify a different client.
export async function switchClient() {
  const { user, client } = useAuthStore.getState();
  await api.post('/client/leave').catch(() => {});
  await clearClientCache(client?.id);
  await clearRunningTimers();
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
