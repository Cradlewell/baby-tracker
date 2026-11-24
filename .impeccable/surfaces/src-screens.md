---
version: 1
slug: "src-screens"
primary_target: "src/screens"
related_targets: ["src/navigation/AppNavigator.js"]
---

## Scope

All app screens (src/screens/*, src/navigation/AppNavigator.js). Mode: operate. Audience: nurses and parents logging newborn care one-handed, often at night.

## Constraints

- The Home "Quick log" section stays exactly as it is (user instruction): same tiles, same colours, same layout.
- Official Cradlewell brand: #6388FF, #5F47FF, navy #1B1F2E, brand gradient -45°; classic sans; pictorial mark logo.
- Status colours (green normal, amber attention, red urgent/overdue) appear only where they carry a status, as in the user's mock.

## Direction contract

THESIS: The user's own mock is the direction: a calm brand-lavender app where one gradient card per screen carries the screen's live state, and everything else is white cards on lavender. Refuses the multi-colour category look.
OWN-WORLD: Lavender ground #F5F6FF; white rounded cards (20) with a soft lavender hairline; outline icons in #5F47FF on #EEF0FF tiles; navy text; one -45° brand-gradient hero card per screen with translucent white stat tiles; gradient pill primary buttons; selected chips lavender-filled with violet border and check.
STORY: Open a screen, read its live state in the gradient card, act with the one gradient button, check the recent list below.
FIRST VIEWPORT: Header (back button, title, subtitle; Home: logo and wordmark), gradient hero card, then the screen's main action and lists; bottom bar with labelled icons, active tab a gradient pill.
FORM: pinned by the user's mock-up image (no roll used).
seed: none (pinned) "remaining i want like this for all" (user's mock-up: Updated UI with Brand Colors)
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
