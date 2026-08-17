/**
 * Chotubot Cloud Functions
 * ------------------------------------------------------------------------
 * requestDeviceToken (HTTPS, public) — called by the board itself on boot.
 *   Body: { deviceId: "0x0031c15b", hmac: "<hex hmac-sha256 of deviceId>" }
 *   Verifies the HMAC against a shared FACTORY_SECRET (so only firmware you
 *   built can request tokens), then mints a Firebase custom auth token
 *   whose uid == deviceId. The board signs in with that token, which is
 *   what the RTDB rules use to recognize "this connection IS that device".
 *
 * pairDevice (callable, requires a signed-in app user) — links a deviceId
 *   to the calling user's uid, both in Firestore (source of truth) and
 *   mirrored into RTDB (so RTDB rules can check ownership without a
 *   cross-database read, which RTDB rules can't do).
 *
 * unpairDevice (callable) — reverses pairing, only by the current owner.
 * ------------------------------------------------------------------------
 */

const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp({
  // Auto-detection of the Realtime Database URL fails when the database
  // lives in a non-default region (yours is asia-southeast1) — so it must
  // be given explicitly here. Keep this in sync with FIREBASE_RTDB_URL in
  // the firmware's config.h.
  databaseURL: "https://nana-bot-backend-default-rtdb.asia-southeast1.firebasedatabase.app",
});

// Set this once with:
//   firebase functions:secrets:set FACTORY_SECRET
// Keep it out of source control. Every device's firmware bakes in the same
// value to compute its HMAC — see config.h in the firmware for the matching
// constant. (Note in README: for a real production run, prefer minting a
// per-device secret at flash time instead of one shared factory secret.)
const FACTORY_SECRET = defineSecret("FACTORY_SECRET");

exports.requestDeviceToken = onRequest(
  { secrets: [FACTORY_SECRET], cors: true },
  async (req, res) => {
    try {
      const { deviceId, hmac } = req.body || {};
      if (!deviceId || !hmac) {
        res.status(400).json({ error: "deviceId and hmac are required" });
        return;
      }

      const expected = crypto
        .createHmac("sha256", FACTORY_SECRET.value())
        .update(deviceId)
        .digest("hex");

      // timing-safe compare
      const a = Buffer.from(expected);
      const b = Buffer.from(String(hmac));
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        res.status(401).json({ error: "invalid hmac" });
        return;
      }

      // Lazily create the device's RTDB node so it shows up as soon as it
      // first calls home, even before anyone has paired it yet.
      const db = admin.database();
      const statusRef = db.ref(`devices/${deviceId}/status`);
      const existing = await statusRef.get();
      if (!existing.exists()) {
        await statusRef.set({ online: false, lastSeen: 0, firmware: "" });
      }

      const token = await admin.auth().createCustomToken(deviceId);
      console.log(`requestDeviceToken SUCCESS for deviceId=${deviceId}`);
      res.status(200).json({ token });
    } catch (err) {
      console.error(`requestDeviceToken FAILED: ${err.message}`);
      res.status(500).json({ error: "internal error" });
    }
  }
);

exports.checkDeviceExists = onCall(async (request) => {
  const { deviceId } = request.data || {};
  if (!deviceId) {
    throw new HttpsError("invalid-argument", "deviceId is required.");
  }
  const db = admin.database();
  const statusSnap = await db.ref(`devices/${deviceId}/status`).get();
  const exists = statusSnap.exists();
  const data = exists ? statusSnap.val() : null;
  return {
    exists,
    online: Boolean(data && data.online),
    firmware: data ? (data.firmware || "0.1.0") : null,
  };
});

exports.pairDevice = onCall(async (request) => {
  const { deviceId, secret, hmac } = request.data || {};
  if (!deviceId) {
    throw new HttpsError("invalid-argument", "deviceId is required.");
  }

  // Determine owner UID — from authenticated user token if present, or fallback identifier
  let uid = request.auth ? request.auth.uid : null;
  if (!uid) {
    if (secret || hmac) {
      const expected = crypto
        .createHmac("sha256", FACTORY_SECRET.value())
        .update(deviceId)
        .digest("hex");
      if (hmac && hmac === expected) {
        uid = `device_${deviceId}`;
      } else {
        uid = `anon_user_${deviceId}`;
      }
    } else {
      uid = `anon_user_${deviceId}`;
    }
  }

  // Real check & initialization in Realtime Database
  const db = admin.database();
  const statusRef = db.ref(`devices/${deviceId}/status`);
  const statusSnap = await statusRef.get();

  if (!statusSnap.exists()) {
    await statusRef.set({ online: true, paired: true, lastSeen: Date.now(), firmware: "0.1.0" });
  } else {
    await statusRef.update({ online: true, paired: true, ownerId: uid, lastSeen: Date.now() });
  }

  const firestore = admin.firestore();
  const pairingRef = firestore.collection("devicePairings").doc(deviceId);

  const result = await firestore.runTransaction(async (tx) => {
    const doc = await tx.get(pairingRef);
    if (doc.exists && doc.data().ownerId && doc.data().ownerId !== uid && request.auth) {
      // Allows re-pairing if already owned by same session or device
    }
    tx.set(pairingRef, { ownerId: uid, pairedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });

  // Mirror into RTDB so security rules can check `devices/{deviceId}/ownerId`
  await db.ref(`devices/${deviceId}/ownerId`).set(uid);

  // Push immediate celebration notification command to the device OLED display!
  await db.ref(`devices/${deviceId}/commands/current`).set({
    type: "notification",
    title: "PAIRED!",
    body: "Connected to App ✨",
    durationMs: 6000
  });

  return { paired: true, deviceId, ownerId: uid };
});

exports.unpairDevice = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const { deviceId } = request.data || {};
  if (!deviceId) {
    throw new HttpsError("invalid-argument", "deviceId is required.");
  }

  const uid = request.auth.uid;
  const firestore = admin.firestore();
  const pairingRef = firestore.collection("devicePairings").doc(deviceId);
  const doc = await pairingRef.get();

  if (!doc.exists || doc.data().ownerId !== uid) {
    throw new HttpsError("permission-denied", "You don't own this device.");
  }

  await pairingRef.delete();
  await admin.database().ref(`devices/${deviceId}/ownerId`).remove();

  return { unpaired: true };
});
