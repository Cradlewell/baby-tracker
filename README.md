# Cradlewell Bloom

A newborn baby tracker for Android and iOS, built with Expo and React Native. Parents use it to log feeds, sleep, diapers, medicine, growth and vaccinations for one or more babies.

Caregivers sign in with an account, verify a client by a one-time code sent to the client's phone, and then work with that client's records. The records are stored in MySQL behind the API in [`server/`](server/README.md); the app never connects to the database directly. There are no analytics.

## Requirements

| Tool | Version |
|---|---|
| Node.js | **22.13 or newer**. Expo SDK 58 and React Native 0.88 don't run on Node 20. |
| npm | Comes with Node |
| Expo Go (on your phone) | A build that supports **SDK 58**. Older Expo Go apps show "project is incompatible". |

## Run locally

Start the API first (see [server/README.md](server/README.md) for the one-time database setup):

```bash
cd server && npm install && npm start
```

Then, in another terminal, the app:

```bash
npm install
npx expo start
```

In development the app calls the API on port 4000 of the computer running Expo. Set `EXPO_PUBLIC_API_URL` to use another address.

Scan the QR code with Expo Go on Android, or with the Camera app on iOS. Your phone and computer must be on the same Wi‑Fi network.

- If Expo asks you to log in and you don't want to, use `npx expo start --offline`.
- If your phone can't reach your computer (for example on office Wi‑Fi or a VPN), use `npx expo start --tunnel`.
- After changing dependencies, run `npx expo install --check` to confirm every package matches SDK 58.

## Tech stack

- **Expo SDK 58**, React Native 0.88, React 19
- **React Navigation 7**: a stack navigator plus a custom bottom tab bar
- **Zustand** for state, saved manually to **AsyncStorage**
- **date-fns** for dates, **expo-haptics** for haptic feedback, **Ionicons** for icons

## Project structure

```
App.js                      Root: gesture handler, safe area, navigator
src/
  navigation/AppNavigator.js  Stack (Splash, Onboarding, Main, modals) and tab bar
  screens/                  One file per screen (Home, Feeding, Sleep, Growth, More,
                            Diaper, Medicine, Vaccination, Summary, Settings, EditBaby,
                            Onboarding, Splash)
  store/                    One Zustand store per feature (baby, feeding, sleep, diaper,
                            medicine, growth, vaccination)
  lib/dataReset.js          Delete one baby's data, or clear everything
  utils/formatters.js       Date of birth parsing and checks, unit conversion,
                            "today" calculations, formatting helpers
  constants/                Colours (light and dark) and theme tokens
```

## Sign-in flow

```
Splash → Login ─┬─ Register → VerifyOtp (own phone) → Login
                └─ ClientVerify (client's phone) → VerifyOtp (client's phone) → Main / Onboarding
```

- `src/lib/session.js`: register, login, client verification, logout, switch client, and restoring the session on start.
- `src/lib/api.js`: HTTP calls to the API. On an expired session or revoked access, the navigator sends the user back to Login or ClientVerify.
- The session token is kept in `expo-secure-store` (Keychain / Keystore).
- Logout and **Switch Client** are in Settings → Account.
- Each time the app opens, a logged-in nurse is asked for the client's phone number again (one nurse serves many clients). Changes saved offline are uploaded first. Without internet, the last client opens from the phone's cached copy.

## How data is stored

The stores still read and write through an AsyncStorage-style API, but they import it from `src/lib/storage.js`. While a client is verified, that module sends baby profiles and records to the API (MySQL) and keeps a cached copy on the phone, so the app works offline. Changes made offline are uploaded when the app is next active or saves again. Settings and running timers stay on the phone only.

Storage keys:

| Key | Contents |
|---|---|
| `@cradlewell_babies` | Baby profiles |
| `@cradlewell_active` | ID of the currently selected baby |
| `@cradlewell_settings` | Settings (dark mode) |
| `@cw_<feature>_<babyId>` | Logs per baby: `feeding`, `sleep`, `diaper`, `medicine`, `growth`, `vaccination` |
| `@cw_feeding_session`, `@cw_sleep_session` | A feed or sleep timer that's currently running |

Rules to keep in mind when changing the code:

- **Timers store timestamps, not tick counts.** A running feed or sleep is saved to storage, so it keeps counting correctly when the phone is locked or the app is closed. Never count elapsed time with `setInterval`.
- **A running timer belongs to one baby** (`session.babyId`).
- **Each baby's data is deleted through `src/lib/dataReset.js`.** If you add a new store, give it `removeBaby(babyId)` and `reset()` methods and add it to the store list in that file.
- **Units:** bottle feeds can be in ml or oz, and weights in kg or lbs. Convert with `toMl` and `toKg` from `formatters.js` before adding or comparing values.
- **Dates of birth** are saved as `DD/MM/YYYY`. Always read them with `parseDob()`, which returns `null` for dates that don't exist, such as 31/02.

## Vaccination schedule

The default schedule in `src/store/useVaccinationStore.js` follows India's **Universal Immunization Programme (UIP)**. Region-specific vaccines (such as JE) and optional IAP vaccines are not included. Any change to this list should be reviewed by a medical professional.

When a vaccine is renamed, add its old name to `aliases` so that doses parents already marked as done carry over.

## Builds and releases

- **CI:** every push to `main` runs `.github/workflows/build.yml`, which starts an **EAS production build** for Android (an `.aab` file for the Play Store). It needs the `EXPO_TOKEN` secret to be set in the GitHub repo. To avoid an unwanted production build, work on a branch and merge to `main` when ready.
- **Pinned versions:** the workflow uses Node 22 and `eas-cli` 27.11.0. Update them on purpose, not by switching back to `latest`.
- **Installable test build:** `eas build --platform android --profile preview` produces an `.apk` you can install directly on a phone.
- **Before each Play Store upload:** increase `expo.android.versionCode` (and `expo.version` for releases users will see) in `app.json`. Google Play rejects a version code it has already received.
- **iOS submit:** `eas.json` still has placeholder Apple IDs, so fill them in before submitting.

## Known gaps

- The app has no automated tests and no linter yet. The API has an end-to-end test (`cd server && npm test`).
- The **Export data** option is a placeholder.
- Reminders and notifications are not implemented.
