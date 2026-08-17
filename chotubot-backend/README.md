# Chotubot Backend (Firebase)

## What's here
- `firebase.json` — tells the Firebase CLI where functions/rules live
- `database.rules.json` — Realtime Database security rules (device + owner access only)
- `firestore.rules` — Firestore rules for pairing records (locked to Cloud Functions writes)
- `functions/index.js` — `requestDeviceToken`, `pairDevice`, `unpairDevice`

## How the pieces fit together
1. A board boots, computes an HMAC of its own device ID using a shared s
   `FACTORY_SECRET`, and calls `requestDeviceToken`.
2. The function checks the HMAC and mints a Firebase **custom auth token**
   whose `uid` is literally the device ID (e.g. `0x0031c15b`).
3. The board signs in with that token and opens a realtime stream on
   `/devices/{deviceId}/commands/current`.
4. When a user opens the app and enters that device ID, the app calls
   `pairDevice`, which records `ownerId` in Firestore and mirrors it into
   RTDB at `/devices/{deviceId}/ownerId`.
5. From then on, the security rules allow **only that owner's uid** to write
   to `/devices/{deviceId}/commands/current` — the app writes a command
   there, the board's stream fires, and it reacts on screen.

No custom server to run or host — Functions, RTDB, and Firestore are all
managed by Firebase itself.

## One-time setup
```bash
npm install -g firebase-tools
firebase login
firebase init            # select Functions, Realtime Database, Firestore
                          # point it at this folder's existing files when asked
cd functions && npm install && cd ..

# Set the shared factory secret (must match FACTORY_SECRET in config.h)
firebase functions:secrets:set FACTORY_SECRET

firebase deploy --only functions,database,firestore:rules
```

After deploying, copy:
- The **Web API Key** (Project Settings → General) into `FIREBASE_API_KEY` in the firmware's `config.h`
- The **Realtime Database URL** into `FIREBASE_RTDB_URL`
- The deployed `requestDeviceToken` URL (shown in the deploy output, or
  Functions tab in console) into `TOKEN_FUNCTION_URL`

## Provisioning devices for real (before this is a business)
Right now every unit shares one `FACTORY_SECRET` baked into the firmware
binary — fine for prototyping, but anyone who extracts the secret from a
flashed chip could mint tokens for device IDs they don't own. Before selling
these, the cleaner approach is a per-device secret written to each unit's
NVS storage at flash time (a small provisioning script that flashes a
random secret + records it in Firestore per unit), so no single secret
unlocks the whole fleet. Worth revisiting once you're past the prototype.

## Firebase Authentication Setup & Troubleshooting

### Enabling Sign-In Providers in Firebase Console
If the mobile app throws `[auth/configuration-not]` (`CONFIGURATION_NOT_FOUND` / `auth/configuration-not-found`), enable the required Authentication providers in Firebase Console:

1. Open [Firebase Console](https://console.firebase.google.com/) → Select your project (`nana-bot-backend`).
2. Go to **Authentication** → **Sign-in method**.
3. Enable the following providers:
   - **Phone**: Required for SMS verification code sign-in.
   - **Anonymous**: Required for instant guest access without requiring phone setup.
   - **Email/Password**: Optional alternative for enterprise/staff accounts.

### Android Phone Auth SHA-1 Footprint (Optional for SMS Autofill)
For production Android builds using Phone Auth:
1. Generate your SHA-1 fingerprint (`cd android && ./gradlew signingReport`).
2. Add the SHA-1 to **Project Settings** → **General** → **Your Android Apps** → **Add fingerprint**.
3. Download the updated `google-services.json` and replace `Mobile-app/android/app/google-services.json`.

---

## Pairing flow the app needs
1. User reads the device ID off the OLED boot screen or box label
2. App calls `pairDevice({ deviceId })` (Firebase callable, needs a signed-in user)
3. App can then read `/devices/{deviceId}/status` for online/last-seen and
   write to `/devices/{deviceId}/commands/current` directly using the
   Firebase client SDK — no extra function needed for sending commands,
   the RTDB rules enforce ownership.

Next step: the React Native app — pairing screen, notification-forwarding,
Google Maps direction capture, and a doodle canvas that encodes to the
base64 bitmap the firmware expects.

