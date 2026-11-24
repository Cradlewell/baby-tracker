# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

- **Nurses and caregivers** who look after several families' newborns. They log in with their own account, open one client at a time by the client's phone number, log care as it happens, and switch between clients during the day. The app asks for the client again every time it opens.
- **Parents**, who also use the app to see and add their own baby's records.

Both log care in short moments, often one-handed, often at night, sometimes offline.

## Product Purpose

Cradlewell Bloom records a newborn's daily care so the people looking after the baby see the same, current picture: feeds, sleep, diapers, medicine, growth and vaccinations. Success is a log that is quick to fill in during care, and a record a nurse or parent can trust and hand on.

## Positioning

Care records belong to the client (the family), not to one nurse: any nurse can open a client by phone number and continue where the last carer stopped, and the records sync through one backend, with an offline copy on the phone.

## Operating Context

- Home and care visits: a nurse moves between families, opening each client by phone number; **Switch client** is on Home, More and Settings.
- Night care and feeds: dark mode exists; running feed and sleep timers keep counting while the phone is locked.
- Reminders: the phone plays a sound when a medicine's next dose is due and the day before / on the day a vaccine is due.
- Connectivity is unreliable: changes made offline are uploaded later.

## Capabilities and Constraints

- Tracking: breast and bottle feeds (timers, sides, quantities), sleep (naps and night sleep, timers, wakeups), diapers (urine, stool, both, dry; urine and stool colours with doctor-warning colours), medicine (dose, unit, given or skipped, next-dose reminder with countdown), growth (weight, length, head), vaccinations (India's UIP schedule, completion, reminders), daily summary.
- Several babies per client; one active baby at a time.
- Stack: Expo SDK 58, React Native 0.88, React Navigation 7, Zustand. Node/Express API with two MySQL databases (authentication; clients and monitoring records). One shared custom design on Android and iOS that respects each platform's basics; both platforms matter equally.
- Accounts: email and password; OTP codes are built but switched off for now.
- Undecided: who may create accounts (any sign-up today), real SMS provider, export.

## Brand Commitments

- Name: **Cradlewell Bloom** (brand wordmark: Cradlewell). Tagline: "Your comfort is our care".
- **Official brand guidelines** (Cradlewell Brand Representation and Color Scheme PDFs, supplied by the user) are binding:
  - Design direction "Nurturing Womb"; colour "Lavender Fields".
  - Colours: **#6388FF** (Pantone 2718 C) and **#5F47FF** (Pantone 2725 C).
  - Brand gradient: #6388FF to #5F47FF at -45°, stops at 25% and 100%, midpoint 75%.
  - Dark: the navy of the one-colour logo (used as **#1B1F2E**).
  - Font: classic sans serif; the wordmark sets "Cradle" bold and "well" light. Tagline in tracked capitals: "YOUR COMFORT IS OUR CARE".
  - Logo: pictorial mark (letters C and W with a mom and baby inside a heart), `assets/logo.png`; white version on the gradient, gradient or navy version on white.
- **Three colours only** (confirmed by the user): #6388FF, #5F47FF and navy #1B1F2E, plus lighter and darker shades of these; no other hues.
- Contrast rules: white on #5F47FF is 5.5:1 (buttons, small text, active states); white on #6388FF is 3.2:1 (large bold text, backgrounds and the gradient only); navy on white is 16.4:1 (body text).
- Care types (feed, sleep, diaper, medicine, growth, vaccine) are told apart by icon and label, not by colour. Warnings use the brand colours plus a warning icon, not a separate red.
- Open: the brand wordmark reads "Cradlewell"; the app is currently named "Cradlewell Bloom".
- There is no "Clear All Data" option in the app: carers must not be able to wipe a client's records from a phone (confirmed by the user).

## Evidence on Hand

- No testimonials, customer names, clinical claims or partner logos exist; none may be invented.
- Medical guidance in the app (diaper-colour warnings, newborn norms, the UIP schedule) is general guidance and should be reviewed by a doctor before families rely on it.

## Product Principles

1. Logging takes seconds: the common action for any care event is one or two taps from Home.
2. The record is shared and trustworthy: whatever one carer logs, the next carer sees, with times that are exact.
3. Warnings are calm and specific: when something needs a doctor, say so plainly, never alarm without reason.
4. Works at 3 a.m.: readable in the dark, one-handed, with no small targets.

## Accessibility & Inclusion

- Used one-handed and at night: large touch targets, readable contrast in light and dark mode.
- Users include parents who are not technical; plain words, no jargon.
