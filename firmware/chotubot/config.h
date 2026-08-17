#ifndef CHOTUBOT_CONFIG_H
#define CHOTUBOT_CONFIG_H

// ---------------------------------------------------------------------------
// Debug feature toggles
// ---------------------------------------------------------------------------
// Set either to 0 to disable that whole subsystem — useful for isolating
// which part of the board is actually causing a crash/reboot. Try
// FEATURE_FIREBASE 0 first (board will just sit at WiFi-connected with no
// cloud commands, but shouldn't crash) — if it STILL crashes with Firebase
// off, the touch/settings/animation code is the cause, not Firebase.
#define FEATURE_FIREBASE   1
#define FEATURE_TOUCH      1

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------
#define SCREEN_WIDTH      128
#define SCREEN_HEIGHT     64
#define SCREEN_I2C_ADDR   0x3C   // most SSD1306 modules use 0x3C; some use 0x3D

#define OLED_SDA_PIN      21      // adjust to match your ESP32-C3 board's silkscreen
#define OLED_SCL_PIN      20

// ---------------------------------------------------------------------------
// Firebase project settings
// ---------------------------------------------------------------------------
// From Firebase Console -> Project Settings -> General (Web API Key), and
// Realtime Database -> the URL shown at the top of the data view.
#define FIREBASE_API_KEY      "AIzaSyDkkCn3OZ-GrUjMY1kTCgjfYOT4gh6VJnU"
#define FIREBASE_RTDB_URL     "https://nana-bot-backend-default-rtdb.asia-southeast1.firebasedatabase.app"

// The HTTPS URL of the requestDeviceToken Cloud Function, e.g.
// https://us-central1-your-project-id.cloudfunctions.net/requestDeviceToken
#define TOKEN_FUNCTION_URL    "https://requestdevicetoken-agfpyjubgq-uc.a.run.app"

// Must exactly match the FACTORY_SECRET set in the Cloud Functions with:
//   firebase functions:secrets:set FACTORY_SECRET
// This proves to the backend that a token request is coming from firmware
// you built, not a stranger guessing device IDs. See README for the
// production-hardening note about per-device secrets instead of one shared
// factory secret.
#define FACTORY_SECRET        "h7pjx2fOClvnj18JDpfA06MMZSVlkZ"

#define FIRMWARE_VERSION      "0.1.0"

// ---------------------------------------------------------------------------
// Touch sensor
// ---------------------------------------------------------------------------
// ESP32-C3 has no built-in capacitive touch peripheral (unlike classic
// ESP32), so this assumes an external touch module (TTP223 or similar,
// 3-pin VCC/GND/OUT) wired to a digital GPIO — OUT goes HIGH while touched.
#define TOUCH_PIN         10

// ---------------------------------------------------------------------------
// Speaker (Piezo / Audio Output on Pin 6)
// ---------------------------------------------------------------------------
#define SPEAKER_PIN       6

// ---------------------------------------------------------------------------
// Time sync (for the touch-triggered clock view)
// ---------------------------------------------------------------------------
#define NTP_SERVER         "pool.ntp.org"
#define GMT_OFFSET_SEC     (5 * 3600 + 1800)  // IST, UTC+5:30 — change for your timezone
#define DAYLIGHT_OFFSET_SEC 0

// ---------------------------------------------------------------------------
// Behavior
// ---------------------------------------------------------------------------
// Default idle timeout — overridden at runtime by the persisted setting
// (see settings.h); this constant is only the fallback before any setting
// has ever been saved.
#define IDLE_TIMEOUT_MINUTES_DEFAULT   5

// ---------------------------------------------------------------------------
// Ambient auto-expression cycling
// ---------------------------------------------------------------------------
// While idle, the face automatically switches to a random expression on a
// randomized timer averaging ~15s (not a fixed interval — the randomization
// between MIN/MAX is what makes it read as natural rather than mechanical).
// Tune these two values to change the pacing.
#define AUTO_EXPRESSION_MIN_MS   12000
#define AUTO_EXPRESSION_MAX_MS   18000

#endif
