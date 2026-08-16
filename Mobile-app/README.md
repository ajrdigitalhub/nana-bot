# Chotubot App (React Native, Android)

## What's here
- `App.tsx` — login → pairing → then a persistent bottom tab bar (Home / Navigate / Games), with Doodle as a full-screen overlay reachable from Home
- `src/components/BottomTabBar.tsx` — the tab bar itself
- `src/screens/` — LoginScreen (phone OTP), PairingScreen, HomeScreen, NavigateScreen, GamesScreen, DoodleScreen
- `src/services/commands.ts` — writes/reads the same RTDB paths the firmware and backend use, including `watchGameResult` (the one place data flows *device → app*)
- `src/services/notificationForwarder.ts` — bridges Android notifications (incl. Google Maps direction parsing) to Chotubot commands; also exposes `isForwarding()` so both Home and Navigate can show a consistent toggle state
- `src/services/bitmapEncoder.ts` — converts a drawn doodle into the packed 1bpp bitmap the firmware expects
- `src/theme.ts` — shared colors/spacing used across every screen
- `android/app/src/main/java/com/chotubot/notiflistener/` — the native NotificationListenerService + bridge module
- `android/app/src/main/AndroidManifest.snippet.xml` — pieces to merge into your real manifest

## New in this version
- **Navigate tab** — type a destination and launch Google Maps navigation via a deep link (not an embedded map — that would need a Maps API key/billing on your end). Turn-by-turn then reaches the Chotubot through the same notification mirroring as before. Also has manual nav-arrow test buttons (left/right/straight/u-turn/arrived) for checking the display without driving.
- **Games tab** — triggers the firmware's reaction-time game (`{"type":"game","action":"start"}`) and displays the result once the board reports it back, plus a locally-tracked best score (AsyncStorage, per device).
- **Home tab** — added a Wave quick-reaction button alongside Happy/Angry/Sad.

## 1. Create the project shell
This scaffold assumes a standard RN project layout. If you don't have one yet:
```bash
npx react-native init ChotubotApp --version 0.74.0
```
Then copy `App.tsx`, `src/`, and the three Java files (plus the manifest additions) into the generated project, replacing/merging as needed.

## 2. Install dependencies
```bash
npm install
cd ios && pod install && cd ..    # not needed for this Android-only build, skip
```

## 3. Firebase setup
1. In the Firebase Console (same project as the backend): Authentication → Sign-in method → enable **Phone**.
2. Add an Android app to the project (package name must match `android/app/build.gradle`'s `applicationId`, e.g. `com.chotubot.app`), download `google-services.json`, place it at `android/app/google-services.json`.
3. Follow the standard `@react-native-firebase` Android setup (adding the Google services Gradle plugin) — see https://rnfirebase.io/ if this is your first time; it's a few lines in `android/build.gradle` and `android/app/build.gradle`.

## 4. Register the native notification-listener module
`@react-native-firebase` packages autolink automatically, but this is a **local**
module (not published to npm), so it needs one manual step. In
`android/app/src/main/java/.../MainApplication.java`, find `getPackages()` and add:
```java
packages.add(new com.chotubot.notiflistener.NotificationListenerPackage());
```

Then merge `AndroidManifest.snippet.xml`'s `<service>` block (and the
`INTERNET` permission, if not already present) into your real
`AndroidManifest.xml`.

## 5. Run it
```bash
npx react-native run-android
```

## How notification mirroring works
- The user taps "Start mirroring" on the Home screen, which calls
  `ensureNotificationPermission()` — this opens Android's **Notification
  access** settings screen (Android does not allow granting this
  permission from inside the app; the user must flip the toggle for
  Chotubot manually).
- Once granted, `ChotuNotificationListenerService` fires for every
  notification posted anywhere on the phone. It's forwarded to JS, which:
  - If it's from Google Maps and the text matches a turn instruction
    ("Turn left…", "Continue straight…", "U-turn…"), sends a `nav` command
  - Otherwise sends a generic `notification` command
- **Caveat (already flagged, repeating here for visibility):** the Maps
  direction parsing is regex matching against notification text, not an
  official API. If Google changes the wording, `parseMapsDirection()` in
  `notificationForwarder.ts` will need updating. Test it against your own
  phone's actual Maps notifications before relying on it.

## How the doodle canvas works
`DoodleScreen` draws on a `react-native-canvas` surface at 3x the device's
real 128x64 resolution (easier to draw on with a finger), then on send:
1. Reads the full-resolution canvas pixels with `getImageData`
2. Downsamples to exactly 128x64 by picking one pixel per 3x3 block
3. Thresholds each pixel to black/white and packs it 1-bit-per-pixel,
   MSB-first (`bitmapEncoder.ts`) — this exact format is what
   `Adafruit_GFX::drawBitmap()` expects in the firmware's `faces.h`
4. Base64-encodes it and writes it to `/devices/{deviceId}/commands/current`

If doodles show up corrupted or mirrored on the actual hardware, it's
almost always a bit-order or row-byte-width mismatch between this encoder
and `faces_setCustomDoodle()` — check `rowBytes = ceil(width/8)` matches on
both sides first.

## What's still missing before this is a sellable product
- iOS app (notifications only, no nav mirroring — see the platform tradeoff discussed earlier)
- Push notifications / background reliability (Android may kill the
  notification listener service under aggressive battery optimization on
  some OEMs — Xiaomi/Oppo/Vivo devices especially need the user to
  whitelist the app)
- Proper error/empty states, onboarding flow, account settings (sign out, unpair)
- App Store / Play Store listing, icons, privacy policy (reading
  notifications requires a clear privacy disclosure for Play Store approval)
- Per-device factory secrets for the firmware side (flagged earlier in the backend README)
