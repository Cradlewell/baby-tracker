import Constants from 'expo-constants';

// Where the backend runs. Set EXPO_PUBLIC_API_URL (e.g. https://api.example.com) for real builds.
// In development it defaults to port 4000 on the computer running `expo start`,
// so a phone on the same Wi-Fi reaches the local server without extra setup.
function resolveBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host || 'localhost'}:4000`;
}

export const API_URL = resolveBaseUrl();

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// A network problem (offline, server down) rather than an answer from the server.
export const isNetworkError = (err) => err instanceof ApiError && err.status === 0;

let token = null;
let onUnauthorized = null;

export function setApiToken(value) {
  token = value;
}

// Called when the server says the session is no longer valid (expired, logged out elsewhere,
// or access to the client was revoked).
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function apiRequest(method, path, body, { auth = true } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (_) {
    // In development, name the address so a wrong URL or a stopped server is easy to spot.
    const where = __DEV__ ? ` (tried ${API_URL})` : '';
    throw new ApiError(0, 'network', `Can't reach the server${where}. Check your internet connection and try again.`);
  }

  const json = await res.json().catch(() => null);
  if (res.ok) return json;

  const code = json?.error?.code || 'server_error';
  const message = json?.error?.message || 'Something went wrong. Please try again.';
  const err = new ApiError(res.status, code, message);
  // 403 on a data request means this session lost access to the client. On the client
  // verification screen a 403 is an ordinary answer ("not authorized"), shown inline instead.
  const sessionLost = res.status === 401 || (res.status === 403 && path.startsWith('/data/'));
  if (auth && token && sessionLost && onUnauthorized) onUnauthorized(err);
  throw err;
}

export const api = {
  get: (path) => apiRequest('GET', path),
  post: (path, body, opts) => apiRequest('POST', path, body ?? {}, opts),
  patch: (path, body) => apiRequest('PATCH', path, body),
  delete: (path) => apiRequest('DELETE', path),
};
