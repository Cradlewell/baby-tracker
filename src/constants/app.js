import Constants from 'expo-constants';
import { API_URL } from '../lib/api';

// Facts about the app shown in Settings, About and the privacy policy. Change them here only.
export const APP_NAME = 'Cradlewell Baby Tracker';
export const APP_VERSION = Constants.expoConfig?.version || '2.0.0';
export const SUPPORT_EMAIL = 'care@cradlewell.com';
// Public web pages served by the Cradlewell server. Give these links in the Play Console:
// Privacy policy, and Data safety -> "Delete account URL".
export const PRIVACY_URL = `${API_URL}/privacy`;
export const DELETE_ACCOUNT_URL = `${API_URL}/delete-account`;
export const PRIVACY_UPDATED = '27 November 2026';

// Shown after a nurse signs up: their account waits for Cradlewell to approve it.
export const APPROVAL_NOTICE = "Your nurse account has been created. Cradlewell will check it and email you when it's approved. Then you can log in.";
