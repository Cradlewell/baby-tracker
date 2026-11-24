import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, isNetworkError } from './api';

/**
 * Drop-in replacement for AsyncStorage used by the stores.
 *
 * While a client is verified, baby profiles and monitoring records are read from and saved
 * to the backend (MySQL) instead of only the phone. Each value is also cached on the phone,
 * so the app keeps working offline; changes made offline are marked "pending" and sent
 * automatically later. Everything else (settings, running timers) stays on the phone.
 *
 * Saves are sent as changes (added/edited records, deleted ids, display order), so two
 * caregivers adding entries for the same client at the same time don't overwrite each other.
 */

const BABIES_KEY = '@cradlewell_babies';
const LOCAL_ONLY = new Set(['@cw_feeding_session', '@cw_sleep_session']);
const RECORD_RE = /^@cw_(feeding|sleep|diaper|medicine|growth|vaccination|temperature|breathing|skin|milestone)_(.+)$/;

let clientId = null;

export function setRemoteClient(id) {
  clientId = id == null ? null : String(id);
}

export const isRemoteActive = () => clientId !== null;

function route(key) {
  if (!clientId || LOCAL_ONLY.has(key)) return null;
  if (key === BABIES_KEY) return { path: '/data/babies', isBabies: true };
  const m = RECORD_RE.exec(key);
  if (m) return { path: `/data/babies/${encodeURIComponent(m[2])}/records/${m[1]}`, isBabies: false };
  return null;
}

const prefix = () => `@remote:${clientId}:`;
const cacheKey = (key) => `${prefix()}data:${key}`;
const syncedKey = (key) => `${prefix()}synced:${key}`;
const pendingKey = (key) => `${prefix()}pending:${key}`;

// Small, fast fingerprint of a record, to detect which ones changed since the last sync.
function fingerprint(item) {
  const s = JSON.stringify(item);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const parseList = (json) => {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string') : [];
  } catch (_) {
    return [];
  }
};

async function saveSynced(key, list) {
  const items = {};
  list.forEach((it) => { items[it.id] = fingerprint(it); });
  await AsyncStorage.setItem(syncedKey(key), JSON.stringify(items));
}

// Operations on the same key run one at a time, in order.
const queues = new Map();
function enqueue(key, fn) {
  const qk = `${clientId}|${key}`;
  const next = (queues.get(qk) || Promise.resolve()).catch(() => {}).then(fn);
  queues.set(qk, next);
  return next;
}

// Sends the difference between the cached value and what the server last confirmed.
async function push(key, r) {
  const list = parseList(await AsyncStorage.getItem(cacheKey(key)));
  const syncedJson = await AsyncStorage.getItem(syncedKey(key));
  const synced = syncedJson ? JSON.parse(syncedJson) : {};
  const ids = new Set(list.map((it) => it.id));

  const upsert = list.filter((it) => synced[it.id] !== fingerprint(it));
  const del = Object.keys(synced).filter((id) => !ids.has(id));
  await api.patch(r.path, { upsert, delete: del, order: list.map((it) => it.id) });
  await saveSynced(key, list);
  await AsyncStorage.removeItem(pendingKey(key));
}

async function tryPush(key, r) {
  try {
    await push(key, r);
    return true;
  } catch (err) {
    // Offline, or a record saved before its baby reached the server: keep it pending.
    if (isNetworkError(err) || err.code === 'baby_not_found' || err.status >= 500 || err.status === 401 || err.status === 403) {
      return false;
    }
    // The server rejected the data itself; retrying would fail forever.
    console.warn(`Sync of ${key} rejected: ${err.message}`);
    await AsyncStorage.removeItem(pendingKey(key));
    return false;
  }
}

async function getItem(key) {
  const r = route(key);
  if (!r) return AsyncStorage.getItem(key);
  return enqueue(key, async () => {
    // Unsent local changes win: send them before reading the server copy.
    if (await AsyncStorage.getItem(pendingKey(key))) {
      if (!(await tryPush(key, r))) return AsyncStorage.getItem(cacheKey(key));
    }
    try {
      const { items } = await api.get(r.path);
      const json = JSON.stringify(items);
      await AsyncStorage.setItem(cacheKey(key), json);
      await saveSynced(key, items);
      return json;
    } catch (_) {
      return AsyncStorage.getItem(cacheKey(key));
    }
  });
}

async function setItem(key, value) {
  const r = route(key);
  if (!r) return AsyncStorage.setItem(key, value);
  await AsyncStorage.setItem(cacheKey(key), value);
  await AsyncStorage.setItem(pendingKey(key), '1');
  const sent = await enqueue(key, () => tryPush(key, r));
  // A new baby just reached the server: its records saved offline can follow now.
  if (sent && r.isBabies) flushPending().catch(() => {});
}

async function removeItem(key) {
  const r = route(key);
  if (!r) return AsyncStorage.removeItem(key);
  await AsyncStorage.multiRemove([cacheKey(key), syncedKey(key), pendingKey(key)]);
  if (!r.isBabies) {
    // Deleting the baby profile afterwards removes these on the server too, so a failure here is harmless.
    await enqueue(key, () => api.delete(r.path).catch(() => {}));
  }
}

// Sends every change saved while offline. Baby profiles go first, so their records have a parent.
export async function flushPending() {
  if (!clientId) return;
  const p = `${prefix()}pending:`;
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(p)).map((k) => k.slice(p.length));
  keys.sort((a, b) => (a === BABIES_KEY ? -1 : b === BABIES_KEY ? 1 : 0));
  for (const key of keys) {
    const r = route(key);
    if (r) await enqueue(key, () => tryPush(key, r));
  }
}

export async function hasPendingChanges() {
  if (!clientId) return false;
  return (await AsyncStorage.getAllKeys()).some((k) => k.startsWith(`${prefix()}pending:`));
}

// Removes this phone's cached copy of a client's data (on logout or client switch).
export async function clearClientCache(id = clientId) {
  if (id == null) return;
  const p = `@remote:${id}:`;
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(p));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}

export default { getItem, setItem, removeItem };
