import { create } from 'zustand';

// Who is logged in and which client's records are open. Changed only through lib/session.js.
//   status: 'unknown' (starting) | 'signedOut' | 'needsClient' (logged in, client not verified) | 'ready'
export const useAuthStore = create((set) => ({
  status: 'unknown',
  user: null,
  client: null,
  setAuth: (patch) => set(patch),
}));
