// Continue with Google: asks Google (on the phone) for an ID token the server can check.
//
// Needs, from Google Cloud Console (APIs & Services > Credentials):
//   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID  the Web client ID: the token is issued for it
//   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID  the iOS client ID (iPhone only)
// and an Android client ID for package com.cradlewell.bloom with the app's SHA-1 (no code needed).
// The native module is not in Expo Go, so it is loaded defensively.
let Google = null;
try {
  // eslint-disable-next-line global-require
  Google = require('@react-native-google-signin/google-signin');
} catch (_) {
  Google = null;
}

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

let configured = false;

/** Shows Google's account picker. Resolves the ID token, or null if the person cancelled. */
export async function getGoogleIdToken() {
  const { GoogleSignin, statusCodes } = Google || {};
  if (!GoogleSignin) {
    throw new Error('Google sign-in works in the installed Cradlewell app, not in Expo Go. Please use your email and password here.');
  }
  if (!WEB_CLIENT_ID) {
    throw new Error('Google sign-in is not set up yet. Please use your email and password.');
  }
  try {
    if (!configured) {
      GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID, offlineAccess: false });
      configured = true;
    }
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Forget the last choice so the account picker always shows (a nurse may use several).
    await GoogleSignin.signOut().catch(() => {});
    const res = await GoogleSignin.signIn();
    if (res?.type === 'cancelled') return null;
    const idToken = res?.data?.idToken;
    if (!idToken) throw new Error('Google did not return a sign-in token. Please try again.');
    return idToken;
  } catch (err) {
    if (err?.code === statusCodes?.SIGN_IN_CANCELLED || err?.code === statusCodes?.IN_PROGRESS) return null;
    if (err?.code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error('Google Play services are missing or out of date on this phone.');
    }
    throw new Error(err?.message || 'Google sign-in failed. Please try again.');
  }
}
