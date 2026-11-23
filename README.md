# Cradlewell Bloom

A newborn baby tracker for Android and iOS, built with Expo and React Native. Parents use it to log feeds, sleep, diapers, medicine, growth and vaccinations for one or more babies.

All data is stored **only on the device**. There is no backend, no login and no analytics.

## Requirements

| Tool | Version |
|---|---|
| Node.js | **22.13 or newer**. Expo SDK 58 and React Native 0.88 don't run on Node 20. |
| npm | Comes with Node |
| Expo Go (on your phone) | A build that supports **SDK 58**. Older Expo Go apps show "project is incompatible". |

## Run locally

```bash
npm install
npx expo start
```

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

## How data is stored

Everything is kept in AsyncStorage on the device:

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

- There are no automated tests and no linter yet.
- The **Export data** option is a placeholder.
- Reminders and notifications are not implemented.
