 /*
 * ============================================================================
 *  CHOTUBOT FIRMWARE  —  ESP32-C3 + SH1106 OLED + touch sensor (Firebase edition)
 * ============================================================================
 *
 *  What this does:
 *   - Boots, connects to WiFi (first-time setup via WiFiManager captive portal)
 *   - Computes an HMAC of its own device ID and exchanges it with a Cloud
 *     Function for a Firebase custom auth token (uid == deviceId)
 *   - Signs in to Firebase and polls
 *     /devices/{deviceId}/commands/current every ~1s (not a persistent
 *     stream task — see the comment above pollForCommands() for why)
 *   - Reacts on-screen to whatever arrives there: animated expressions,
 *     notifications, nav-arrows, custom doodles, and an idle/sleep animation
 *   - Reads an external touch sensor for local interaction, no app needed:
 *       single tap   -> shows the current time (NTP-synced) for a few seconds
 *       double tap   -> cycles through expressions (demo/test mode)
 *       long press   -> opens an on-device settings menu (idle timeout,
 *                       12h/24h format, whether single-tap-shows-time is on),
 *                       persisted in flash; tap to move between items,
 *                       double-tap to change the value, long-press to save
 *   - Reports periodic status (online/lastSeen) back to RTDB
 *
 *  Libraries needed (Arduino Library Manager):
 *   - Adafruit GFX Library
 *   - Adafruit SH110X
 *   - ArduinoJson (>= 6.x)
 *   - WiFiManager by tzapu
 *   - Firebase ESP Client by mobizt ("Firebase ESP32 Client" / works on C3 too)
 *   - Preferences (bundled with the ESP32 core — no separate install needed)
 *
 *  Board: "ESP32C3 Dev Module" (esp32 by Espressif Systems, >= 2.0.11)
 *
 *  Extra hardware: an external touch module (e.g. TTP223, 3-pin VCC/GND/OUT)
 *  wired OUT -> TOUCH_PIN in config.h. ESP32-C3 has no built-in touch
 *  peripheral like classic ESP32, so this is required rather than optional.
 * ============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h> // for token status callback printing (used internally by the library)
#include "mbedtls/md.h"

#include "config.h"
#include "settings.h"
#include "touch.h"
#include "faces.h"
#include "dino_game.h"

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------
Adafruit_SH1106G display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

FirebaseData fbdo;       // used for all reads/writes (status updates + polling fallback)
FirebaseData fbdoStream; // dedicated persistent SSE Realtime Stream listener
FirebaseAuth fbAuth;
FirebaseConfig fbConfig;

enum DeviceState {
  STATE_BOOT,
  STATE_IDLE,
  STATE_SLEEPING,
  STATE_EXPRESSION,  // generic — the specific mood lives in activeMood
  STATE_NOTIFICATION,
  STATE_NAV_LEFT,
  STATE_NAV_RIGHT,
  STATE_NAV_STRAIGHT,
  STATE_NAV_UTURN,
  STATE_CUSTOM_DOODLE,
  STATE_SHOW_TIME,
  STATE_SETTINGS,
  STATE_WAVE,
  STATE_GAME_READY,   // "get ready..." countdown, taps here = too soon
  STATE_GAME_GO,      // "GO!" — waiting for the reaction tap
  STATE_GAME_RESULT,  // shows the reaction time (or "too soon")
  STATE_DINO_GAME,    // Chrome Dino-style Elephant runner game
  STATE_WATER_REMINDER, // Animated water tumbler liquid fill & drink alert
  STATE_FOOD_REMINDER   // Steaming meal plate & meal time alert
};

DeviceState currentState = STATE_BOOT;
unsigned long stateEnteredAt = 0;
unsigned long lastActivityAt = 0;
unsigned long lastStatusPushAt = 0;

unsigned long temporaryStateDurationMs = 0;
String pendingNotificationText = "";
String deviceId = "";

EyeMood activeMood = MOOD_DEFAULT; // which mood STATE_EXPRESSION currently shows

int demoExpressionIndex = 0;  // used by the double-tap "cycle expressions" demo
int settingsMenuIndex = 0;    // which item is highlighted in the settings menu

String lastProcessedCommandRaw = ""; // avoids reprocessing the same command every poll
unsigned long lastCommandPollAt = 0;
const unsigned long COMMAND_POLL_INTERVAL_MS = 400;

// Ambient auto-expression cycling — see AUTO_EXPRESSION_MIN_MS/MAX_MS in
// config.h for the timing, and scheduleNextAutoExpression()/
// triggerRandomAutoExpression() further down for the logic.
unsigned long nextAutoExpressionAt = 0;
EyeMood lastAutoMood = MOOD_DEFAULT;

// Reaction game state
unsigned long gameGoDelayMs = 0; // randomized wait before GO, set when the round starts
unsigned long gameGoAt = 0;      // millis() timestamp when GO appeared
int gameLastReactionMs = -1;
bool gameLastTooSoon = false;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  Serial.setTimeout(10);
  
  // Disable USB CDC TX timeout so output never blocks if Serial Monitor is disconnected
  Serial.setTxTimeoutMs(0);

  // Give ESP32-C3 USB CDC / Serial Monitor time to connect after chip reset
  unsigned long serialWaitStart = millis();
  while (!Serial && (millis() - serialWaitStart < 2500)) {
    delay(10);
  }
  delay(500);

  Serial.println("\n==========================================");
  Serial.println("   CHOTUBOT / NANA FIRMWARE STARTING...   ");
  Serial.println("==========================================");
  Serial.flush();

  Wire.setTimeOut(100); // 100ms I2C timeout prevents bus hang if OLED SDA/SCL misses ACK
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  if (!display.begin(SCREEN_I2C_ADDR, true)) {
    Serial.println("WARNING: OLED Display allocation failed at 0x3C (continuing network boot...)");
  } else {
    Wire.setClock(400000);
    display.clearDisplay();
    display.display();
  }

  deviceId = deriveDeviceId();
  Serial.print("Device ID: ");
  Serial.println(deviceId);

  settings_load();
  randomSeed(esp_random()); // true hardware RNG — backs both the reaction game and auto-expression cycling
  #if FEATURE_TOUCH
  touch_init();
  #endif
  dino_initHardware();

  faces_init(&display);

  faces_playInitialDelay(1000);
  faces_playBootIntro();
  faces_playBootHandshake();

  connectToWiFi();
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER); // for the touch-triggered clock view
  
  // Brief wait for NTP time sync (vital for TLS certificates & Firebase Auth token expiration)
  Serial.print("Syncing NTP Time...");
  unsigned long ntpStart = millis();
  while (time(nullptr) < 1000000000 && (millis() - ntpStart < 2000)) {
    delay(100);
    Serial.print(".");
  }
  Serial.println();
  #if FEATURE_FIREBASE
  connectToFirebase();
  #else
  faces_drawLoadingProgress(100, "Firebase disabled (debug)", LOAD_COMPLETE);
  delay(600);
  Serial.println("FEATURE_FIREBASE is 0 — skipping Firebase entirely for isolation testing.");
  #endif

  lastActivityAt = millis();
  transitionTo(STATE_IDLE, 0);
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
void loop() {
  // Skip background network polling during active gameplay to eliminate HTTP stalls
  if (currentState != STATE_DINO_GAME) {
    maintainWiFi();
    maintainWeather();
    #if FEATURE_FIREBASE
    pushStatusPeriodically();
    pollForCommands();
    #endif
    checkPeriodicReminders();
  }

  #if FEATURE_TOUCH
  handleTouchEvent(touch_update());
  #endif
  updateStateMachine();
  renderCurrentState();

  // Smooth non-blocking 60FPS frame pacing (~16ms per frame)
  static unsigned long lastLoopMs = 0;
  unsigned long elapsed = millis() - lastLoopMs;
  if (elapsed < 16) {
    delay(16 - elapsed);
  }
  lastLoopMs = millis();
}

// ---------------------------------------------------------------------------
// WiFi
// ---------------------------------------------------------------------------
void connectToWiFi() {
  // WiFiManager's autoConnect() is a blocking call with no progress
  // callback we can hook per-attempt — so this phase shows an
  // indeterminate (PENDING) bar rather than a fake animated percentage
  // during the call itself, then jumps to a real checkpoint once it
  // actually returns. Only the Firebase phase below has genuine
  // per-frame progress, since we control that wait loop directly.
  faces_drawLoadingProgress(0, "Connecting WiFi...", LOAD_PENDING);

  WiFiManager wm;
  // Uncomment the next line, upload once, then comment it out again and
  // re-upload — this wipes saved WiFi credentials so the "Chotubot-Setup"
  // portal shows up again. Leaving it uncommented would force a WiFi
  // reset on every single boot, not just once.
  // wm.resetSettings();
  bool ok = wm.autoConnect("Chotubot-Setup");
  if (!ok) {
    Serial.println("WiFi setup failed / timed out, restarting...");
    delay(2000);
    ESP.restart();
  }
  Serial.print("WiFi connected: ");
  Serial.println(WiFi.localIP());

  faces_drawLoadingProgress(35, "WiFi connected", LOAD_PROCESSING);
  delay(300); // brief pause so this checkpoint is perceivable, not a flash
}

void maintainWiFi() {
  static unsigned long lastAttempt = 0;
  if (WiFi.status() != WL_CONNECTED) {
    unsigned long now = millis();
    if (now - lastAttempt > 10000) {
      lastAttempt = now;
      Serial.println("WiFi dropped, attempting reconnect...");
      WiFi.reconnect();
    }
  }
}

// ---------------------------------------------------------------------------
// IP Geolocation Weather Fetcher
// ---------------------------------------------------------------------------
void fetchIPWeather() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClient client;
  HTTPClient http;
  http.setTimeout(1500);
  http.setConnectTimeout(1500);

  // 1. Get location via IP
  http.begin(client, "http://ip-api.com/json/");
  int code = http.GET();
  if (code != 200) {
    http.end();
    return;
  }

  String payload = http.getString();
  http.end();

  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) return;

  float lat = doc["lat"] | 0.0f;
  float lon = doc["lon"] | 0.0f;
  const char* city = doc["city"] | "Local";

  if (lat == 0.0f && lon == 0.0f) return;

  // 2. Fetch Open-Meteo Current Weather
  char url[128];
  snprintf(url, sizeof(url), "http://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&current_weather=true", lat, lon);

  http.begin(client, url);
  code = http.GET();
  if (code != 200) {
    http.end();
    return;
  }

  String weatherJson = http.getString();
  http.end();

  StaticJsonDocument<512> wdoc;
  err = deserializeJson(wdoc, weatherJson);
  if (err) return;

  JsonObject cw = wdoc["current_weather"];
  int tempC = (int)round(cw["temperature"].as<float>());
  int wcode = cw["weathercode"].as<int>();

  const char* condition = "Clear";
  if (wcode == 0) condition = "Clear";
  else if (wcode >= 1 && wcode <= 3) condition = "Cloudy";
  else if (wcode >= 45 && wcode <= 48) condition = "Foggy";
  else if (wcode >= 51 && wcode <= 67) condition = "Rainy";
  else if (wcode >= 71 && wcode <= 77) condition = "Snowy";
  else if (wcode >= 80 && wcode <= 82) condition = "Showers";
  else if (wcode >= 95) condition = "Stormy";

  faces_setWeather(tempC, condition, city);
}

void maintainWeather() {
  static unsigned long lastWeatherFetch = 0;
  unsigned long now = millis();
  if (lastWeatherFetch == 0) {
    lastWeatherFetch = now;
    return;
  }
  if (now - lastWeatherFetch > 15 * 60 * 1000) {
    lastWeatherFetch = now;
    fetchIPWeather();
  }
}

// ---------------------------------------------------------------------------
// Firebase: get a custom token from our Cloud Function, then sign in
// ---------------------------------------------------------------------------
String computeDeviceHmac() {
  const char* key = FACTORY_SECRET;
  unsigned char hmacResult[32];

  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  const mbedtls_md_info_t* mdInfo = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_setup(&ctx, mdInfo, 1);
  mbedtls_md_hmac_starts(&ctx, (const unsigned char*)key, strlen(key));
  mbedtls_md_hmac_update(&ctx, (const unsigned char*)deviceId.c_str(), deviceId.length());
  mbedtls_md_hmac_finish(&ctx, hmacResult);
  mbedtls_md_free(&ctx);

  char hex[65];
  for (int i = 0; i < 32; i++) sprintf(hex + (i * 2), "%02x", hmacResult[i]);
  hex[64] = '\0';
  return String(hex);
}

// Calls requestDeviceToken, which verifies our HMAC and returns a Firebase
// custom auth token. Returns "" on failure.
String fetchCustomToken() {
  WiFiClientSecure client;
  // Skips CA certificate validation — acceptable for getting a prototype
  // working, but for production you'd pin Google's root CA instead of
  // trusting any certificate. HTTPClient on ESP32 requires an explicit
  // secure client like this for https:// URLs; without it the TLS
  // handshake silently fails and this function returns "".
  client.setInsecure();

  HTTPClient http;
  http.begin(client, TOKEN_FUNCTION_URL);
  http.addHeader("Content-Type", "application/json");
  // Cloud Functions can take several seconds on a cold start or right after
  // an IAM permission change propagates — set a 10s timeout to allow completion.
  http.setTimeout(10000);
  http.setConnectTimeout(10000);

  StaticJsonDocument<256> body;
  body["deviceId"] = deviceId;
  body["hmac"] = computeDeviceHmac();
  String payload;
  serializeJson(body, payload);

  int code = http.POST(payload);
  String token = "";
  if (code == 200) {
    StaticJsonDocument<1024> resp;
    deserializeJson(resp, http.getString());
    token = resp["token"] | "";
  } else {
    Serial.print("requestDeviceToken failed, HTTP ");
    Serial.println(code);
  }
  http.end();
  return token;
}

void connectToFirebase() {
  faces_drawLoadingProgress(40, "Connecting Cloud...", LOAD_PENDING);
  Serial.print("Free heap before Firebase connect: ");
  Serial.println(ESP.getFreeHeap());

  String customToken = fetchCustomToken();
  if (customToken.length() > 0) {
    Serial.println("Custom token retrieved successfully.");
  } else {
    Serial.println("Notice: Custom token not retrieved, operating in unauthenticated/fallback mode.");
  }

  faces_drawLoadingProgress(60, "Connecting Cloud...", LOAD_PROCESSING);

  fbConfig.api_key = FIREBASE_API_KEY;
  fbConfig.database_url = FIREBASE_RTDB_URL;
  fbConfig.timeout.serverResponse = 10000;
  fbConfig.timeout.rtdbKeepAlive = 45000;
  fbConfig.token_status_callback = tokenStatusCallback;

  if (customToken.length() > 0) {
    Firebase.setCustomToken(&fbConfig, customToken.c_str());
    fbConfig.signer.test_mode = false;
  } else {
    fbConfig.signer.test_mode = true;
  }

  fbdo.setResponseSize(2048);
  fbdoStream.setResponseSize(2048);
  Firebase.begin(&fbConfig, &fbAuth);
  Firebase.reconnectWiFi(true);

  // Quick initial check (1.5s max) so boot sequence completes fast while auth finishes in background
  Serial.print("Authenticating with Firebase RTDB...");
  unsigned long authStart = millis();
  while (!Firebase.ready() && (millis() - authStart < 1500)) {
    delay(100);
  }
  Serial.println();

  if (Firebase.ready()) {
    Serial.println("Firebase Authenticated & Ready!");
  } else {
    Serial.println("Firebase connecting in background (stream listener active)...");
  }

  // Initialize Realtime SSE Stream Listener on commands/current
  static String commandPath = "/devices/" + deviceId + "/commands/current";
  Firebase.RTDB.beginStream(&fbdoStream, commandPath.c_str());

  faces_drawLoadingProgress(100, "Connected!", LOAD_COMPLETE);
  Serial.println("Firebase Ready & Stream Active!");
  if (Firebase.ready()) {
    pushStatusNow();
  }
  pushStatusNow();
  delay(300);
}

// Computes current epoch time in milliseconds (NTP-synced) or fallback ms
double getEpochTimeMs() {
  time_t nowSec = time(nullptr);
  if (nowSec > 1000000000) {
    return (double)nowSec * 1000.0;
  }
  return (double)millis();
}

void pushStatusNow() {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;
  static String statusPath = "/devices/" + deviceId + "/status";
  FirebaseJson json;
  json.set("online", true);
  json.set("lastSeen", getEpochTimeMs());
  json.set("firmware", FIRMWARE_VERSION);
  if (Firebase.RTDB.setJSON(&fbdo, statusPath.c_str(), &json)) {
    Serial.println(">>> RTDB STATUS UPDATED: online=true");
  } else {
    Serial.print(">>> RTDB STATUS ERROR: ");
    Serial.println(fbdo.errorReason());
  }
  lastStatusPushAt = millis();
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Realtime Stream Listener (<1ms Non-Blocking Execution)
// ---------------------------------------------------------------------------
void pollForCommands() {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;

  // 1. Process active Realtime SSE Stream push events immediately (< 1ms execution time)
  if (Firebase.RTDB.readStream(&fbdoStream)) {
    if (fbdoStream.streamAvailable()) {
      String raw = fbdoStream.stringData();
      if (raw.length() == 0 || raw == "null") {
        raw = fbdoStream.jsonString();
      }
      if (raw.length() > 0 && raw != "null" && raw != lastProcessedCommandRaw) {
        lastProcessedCommandRaw = raw;
        Serial.print("[Stream] Realtime command received: ");
        Serial.println(raw);
        handleIncomingMessage(raw);
        return;
      }
    }
  }

  // 2. Safe Fallback Polling (only runs every 15s if stream is silent)
  unsigned long now = millis();
  if (now - lastCommandPollAt >= 15000) {
    lastCommandPollAt = now;
    static String commandPath = "/devices/" + deviceId + "/commands/current";
    if (Firebase.RTDB.get(&fbdo, commandPath.c_str())) {
      String raw = fbdo.stringData();
      if (raw.length() == 0 || raw == "null") {
        raw = fbdo.jsonString();
      }
      if (raw.length() > 0 && raw != "null" && raw != lastProcessedCommandRaw) {
        lastProcessedCommandRaw = raw;
        Serial.print("[Poll] Fallback command fetched: ");
        Serial.println(raw);
        handleIncomingMessage(raw);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Status heartbeat
// ---------------------------------------------------------------------------
void pushStatusPeriodically() {
  unsigned long now = millis();
  if (now - lastStatusPushAt < 15000) return; // every 15s
  lastStatusPushAt = now;

  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;

  static String statusPath = "/devices/" + deviceId + "/status";

  FirebaseJson json;
  json.set("online", true);
  json.set("lastSeen", getEpochTimeMs());
  json.set("firmware", FIRMWARE_VERSION);

  if (!Firebase.RTDB.setJSON(&fbdo, statusPath.c_str(), &json)) {
    Serial.print("Status push failed: ");
    Serial.println(fbdo.errorReason());
  } else {
    Serial.println(">>> Periodic RTDB status push successful");
  }
}

// ---------------------------------------------------------------------------
// Message handling — same JSON contract as before, just arriving via RTDB
// polling instead of a raw WebSocket.
//   {"type":"expression","value":"happy","durationMs":4000}
//     value is any of: happy, angry, sad, surprised, curious, skeptical,
//     sleepy, thoughtful, playful, embarrassed, suspicious, wave, idle
//   {"type":"notification","title":"...","body":"...","durationMs":6000}
//   {"type":"nav","direction":"left"}          // left|right|straight|uturn|arrived
//   {"type":"sleep"}  /  {"type":"wake"}
//   {"type":"doodle","bitmapBase64":"...","w":128,"h":64,"durationMs":8000}
//   {"type":"game","action":"start"}           // reaction game, see below
// ---------------------------------------------------------------------------
void handleIncomingMessage(const String &msg) {
  String payload = msg;
  payload.trim();

  // Un-quote double-serialized JSON strings (e.g. "\"{\\\"type\\\":...}\"")
  while (payload.startsWith("\"") && payload.endsWith("\"") && payload.length() > 2) {
    payload = payload.substring(1, payload.length() - 1);
    payload.replace("\\\"", "\"");
    payload.replace("\\\\", "\\");
    payload.trim();
  }

  DynamicJsonDocument doc(1024);
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.print("❌ [MOBILE ACTION ERROR] JSON parse failed: ");
    Serial.println(err.c_str());
    return;
  }

  lastActivityAt = millis();
  String type = doc["type"] | "";
  
  Serial.println("\n==================================================");
  Serial.print("📱 [MOBILE ACTION RECEIVED] Type: ");
  Serial.print(type);
  Serial.print(" | Raw Payload: ");
  Serial.println(payload);
  Serial.println("==================================================");

  if (type == "system") {
    String action = doc["action"] | "";
    Serial.print(" -> System Action: ");
    Serial.println(action);
    if (action == "ping" || action == "check" || action == "connect") {
      Serial.println(" -> System Ping received from Mobile App!");
      pendingNotificationText = "Connected! ✨";
      faces_glanceAt(0, -6, 600);
      enterExpression(MOOD_CUTE_SMILE, 4000);
      pushStatusNow();
    }

  } else if (type == "expression") {
    String value = doc["value"] | "idle";
    unsigned long dur = doc["durationMs"] | 4000;
    Serial.print(" -> Expression Action: ");
    Serial.print(value);
    Serial.print(" (Duration: ");
    Serial.print(dur);
    Serial.println("ms)");
    applyExpressionCommand(value, dur);

  } else if (type == "notification") {
    String title = doc["title"] | "";
    String body = doc["body"] | "";
    unsigned long dur = doc["durationMs"] | 6000;
    Serial.print(" -> Notification Action: Title='");
    Serial.print(title);
    Serial.print("', Body='");
    Serial.print(body);
    Serial.println("'");
    pendingNotificationText = (title.length() > 0 ? title + ": " : "") + body;
    faces_glanceAt(0, -6, 600);

    if (title.equalsIgnoreCase("PAIRED!") || body.indexOf("Paired") >= 0 || body.indexOf("Connected") >= 0) {
      enterExpression(MOOD_CUTE_SMILE, dur);
    } else {
      transitionTo(STATE_NOTIFICATION, dur);
    }

  } else if (type == "nav") {
    String direction = doc["direction"] | "straight";
    Serial.print(" -> Navigation Action: Direction=");
    Serial.println(direction);
    applyNavCommand(direction);

  } else if (type == "sleep") {
    Serial.println(" -> Sleep Action: Entering Sleep Mode");
    transitionTo(STATE_SLEEPING, 0);

  } else if (type == "wake") {
    Serial.println(" -> Wake Action: Returning to Idle");
    transitionTo(STATE_IDLE, 0);

  } else if (type == "doodle") {
    const char* b64 = doc["bitmapBase64"] | "";
    int w = doc["w"] | SCREEN_WIDTH;
    int h = doc["h"] | SCREEN_HEIGHT;
    unsigned long dur = doc["durationMs"] | 8000;
    Serial.print(" -> Doodle Action: Displaying Bitmap (");
    Serial.print(w);
    Serial.print("x");
    Serial.print(h);
    Serial.println(")");
    faces_setCustomDoodle(b64, w, h);
    transitionTo(STATE_CUSTOM_DOODLE, dur);

  } else if (type == "game") {
    String action = doc["action"] | "";
    Serial.print(" -> Game Action: ");
    Serial.println(action);
    if (action == "start") startReactionGame();
    else if (action == "dino" || action == "runner") {
      dino_startNewGame();
      transitionTo(STATE_DINO_GAME, 0);
    }

  } else if (type == "dino" || type == "runner") {
    Serial.println(" -> Dino Runner Game Started");
    dino_startNewGame();
    transitionTo(STATE_DINO_GAME, 0);

  } else if (type == "reminder") {
    String value = doc["value"] | "";
    Serial.print(" -> Reminder Action: ");
    Serial.println(value);
    if (value == "water" || value == "drink") {
      transitionTo(STATE_WATER_REMINDER, 8000);
    } else if (value == "food" || value == "meal" || value == "eat") {
      transitionTo(STATE_FOOD_REMINDER, 8000);
    }

  } else {
    Serial.print(" -> Unknown message type: ");
    Serial.println(type);
  }
}

// Maps a command's string value to a mood table entry. Returns false for
// unrecognized names (including "wave"/"idle", which aren't moods — those
// are handled separately by applyExpressionCommand below) so callers can
// tell "not a mood" apart from "mood index 0".
bool moodFromString(const String &value, EyeMood &outMood) {
  // SaaS & Business Workflow States
  if (value == "processing" || value == "working") { outMood = MOOD_THOUGHTFUL; return true; }
  if (value == "success" || value == "done" || value == "satisfied") { outMood = MOOD_HAPPY; return true; }
  if (value == "error" || value == "failed" || value == "alert") { outMood = MOOD_ANGRY; return true; }
  if (value == "waiting" || value == "anticipation") { outMood = MOOD_SLEEPY; return true; }
  if (value == "listening" || value == "attentive") { outMood = MOOD_CURIOUS; return true; }
  if (value == "thinking" || value == "pondering") { outMood = MOOD_THOUGHTFUL; return true; }
  if (value == "confirming" || value == "approving") { outMood = MOOD_CUTE_SMILE; return true; }
  if (value == "warning" || value == "cautious") { outMood = MOOD_SKEPTICAL; return true; }
  if (value == "celebrating" || value == "excited") { outMood = MOOD_EXCITED; return true; }
  if (value == "empathizing" || value == "gentle") { outMood = MOOD_LOVING; return true; }
  if (value == "notifying" || value == "alerted") { outMood = MOOD_SURPRISED; return true; }

  // Classic & Animal States
  if (value == "happy") { outMood = MOOD_HAPPY; return true; }
  if (value == "angry") { outMood = MOOD_ANGRY; return true; }
  if (value == "sad") { outMood = MOOD_SAD; return true; }
  if (value == "surprised") { outMood = MOOD_SURPRISED; return true; }
  if (value == "curious") { outMood = MOOD_CURIOUS; return true; }
  if (value == "skeptical") { outMood = MOOD_SKEPTICAL; return true; }
  if (value == "sleepy") { outMood = MOOD_SLEEPY; return true; }
  if (value == "thoughtful") { outMood = MOOD_THOUGHTFUL; return true; }
  if (value == "playful") { outMood = MOOD_PLAYFUL; return true; }
  if (value == "embarrassed") { outMood = MOOD_EMBARRASSED; return true; }
  if (value == "suspicious") { outMood = MOOD_SUSPICIOUS; return true; }
  if (value == "cute" || value == "cutesmile" || value == "smiling") { outMood = MOOD_CUTE_SMILE; return true; }
  if (value == "dog" || value == "puppy") { outMood = MOOD_DOG; return true; }
  if (value == "cat" || value == "kitty") { outMood = MOOD_CAT; return true; }
  if (value == "wink") { outMood = MOOD_WINK; return true; }
  if (value == "love" || value == "loving" || value == "heart") { outMood = MOOD_LOVING; return true; }
  if (value == "dizzy") { outMood = MOOD_DIZZY; return true; }
  if (value == "excited") { outMood = MOOD_EXCITED; return true; }
  if (value == "shocked") { outMood = MOOD_SHOCKED; return true; }
  if (value == "confused") { outMood = MOOD_CONFUSED; return true; }
  return false;
}

void enterExpression(EyeMood mood, unsigned long dur) {
  activeMood = mood;
  transitionTo(STATE_EXPRESSION, dur);
}

void applyExpressionCommand(const String &value, unsigned long dur) {
  EyeMood mood;
  if (value == "wave") {
    transitionTo(STATE_WAVE, dur);
  } else if (value == "idle") {
    transitionTo(STATE_IDLE, 0);
  } else if (moodFromString(value, mood)) {
    enterExpression(mood, dur);
  } else {
    Serial.println("Unknown expression: " + value);
  }
}

void applyNavCommand(const String &direction) {
  if (direction == "left") transitionTo(STATE_NAV_LEFT, 0);
  else if (direction == "right") transitionTo(STATE_NAV_RIGHT, 0);
  else if (direction == "straight") transitionTo(STATE_NAV_STRAIGHT, 0);
  else if (direction == "uturn") transitionTo(STATE_NAV_UTURN, 0);
  else if (direction == "arrived") enterExpression(MOOD_HAPPY, 4000);
}

// ---------------------------------------------------------------------------
// Reaction-time game — triggered remotely from the app ({"type":"game",
// "action":"start"}), but played physically: tap the touch sensor as fast
// as possible once the board shows "GO!". This is the one piece of
// device -> app communication in the whole system (everywhere else, data
// only flows app -> device) — the result is written to
// /devices/{deviceId}/lastGameResult for the app to read.
// ---------------------------------------------------------------------------
void startReactionGame() {
  gameGoDelayMs = 1500 + (random(0, 2500)); // 1.5-4s, unpredictable on purpose
  transitionTo(STATE_GAME_READY, 0);
}

void pushGameResult(int reactionMs, bool tooSoon) {
  gameLastReactionMs = reactionMs;
  gameLastTooSoon = tooSoon;

  #if FEATURE_FIREBASE
  if (!Firebase.ready()) return;
  FirebaseJson json;
  json.set("reactionMs", reactionMs);
  json.set("tooSoon", tooSoon);
  json.set("playedAt", (int)millis());
  String path = "/devices/" + deviceId + "/lastGameResult";
  if (!Firebase.RTDB.setJSON(&fbdo, path.c_str(), &json)) {
    Serial.print("Game result push failed: ");
    Serial.println(fbdo.errorReason());
  }
  #endif
}

// Called from handleTouchEvent() whenever a game state is active — every
// tap during a game means something specific, so it bypasses the normal
// single/double/long-press handling entirely.
void handleGameTouch(TouchEvent ev) {
  if (currentState == STATE_GAME_READY) {
    // Any touch before GO appears counts as jumping the gun.
    pushGameResult(-1, true);
    transitionTo(STATE_GAME_RESULT, 3000);

  } else if (currentState == STATE_GAME_GO) {
    int reactionMs = (int)(millis() - gameGoAt);
    pushGameResult(reactionMs, false);
    transitionTo(STATE_GAME_RESULT, 3000);

  } else if (currentState == STATE_GAME_RESULT) {
    // Tap to dismiss early instead of waiting out the full 3s.
    transitionTo(STATE_IDLE, 0);
  }
}

// ---------------------------------------------------------------------------
// Touch input handling
//   single tap   -> show the current time for a few seconds
//   double tap   -> manually cycle through every mood + wave (quick demo/test)
//   long press   -> open the on-device settings menu; long press again
//                   inside the menu saves and exits
// ---------------------------------------------------------------------------
void cycleDemoExpression() {
  // MOOD_DEFAULT is skipped here (that's what "idle" already looks like) —
  // cycles through every other mood, then wave, then back to idle.
  static const int DEMO_COUNT = MOOD_COUNT; // (MOOD_COUNT - 1) moods + WAVE == MOOD_COUNT slots
  demoExpressionIndex = (demoExpressionIndex + 1) % DEMO_COUNT;

  if (demoExpressionIndex == DEMO_COUNT - 1) {
    transitionTo(STATE_WAVE, 4000);
  } else {
    // +1 skips MOOD_DEFAULT (index 0)
    enterExpression((EyeMood)(demoExpressionIndex + 1), 4000);
  }
}

static bool isSubOptionOpen = false;
static unsigned long lastWaterReminderAt = 0;
static unsigned long lastMealReminderAt = 0;

void checkPeriodicReminders() {
  unsigned long now = millis();
  ChotubotSettings &s = settings_get();

  if (s.waterReminderMinutes > 0) {
    unsigned long intervalMs = (unsigned long)s.waterReminderMinutes * 60000UL;
    if (now - lastWaterReminderAt >= intervalMs) {
      lastWaterReminderAt = now;
      if (currentState == STATE_IDLE || currentState == STATE_SLEEPING) {
        transitionTo(STATE_WATER_REMINDER, 8000);
      }
    }
  }

  if (s.mealReminderHours > 0) {
    unsigned long intervalMs = (unsigned long)s.mealReminderHours * 3600000UL;
    if (now - lastMealReminderAt >= intervalMs) {
      lastMealReminderAt = now;
      if (currentState == STATE_IDLE || currentState == STATE_SLEEPING) {
        transitionTo(STATE_FOOD_REMINDER, 8000);
      }
    }
  }
}

void handleSettingsTouch(TouchEvent ev) {
  if (ev == TOUCH_SINGLE_TAP) {
    if (!isSubOptionOpen) {
      // Level 1: Scroll through main menu options
      settingsMenuIndex = (settingsMenuIndex + 1) % SETTINGS_ITEM_COUNT;
    } else {
      // Level 2: Sub-Option Value Editor -> Cycle/change option value
      if (settingsMenuIndex == 1) settings_cycleSoundMode();
      else if (settingsMenuIndex == 2) settings_cycleIdleTimeout();
      else if (settingsMenuIndex == 3) settings_toggleTimeFormat();
      else if (settingsMenuIndex == 4) settings_cycleTapAction();
      else if (settingsMenuIndex == 5) settings_cycleWaterReminder();
      else if (settingsMenuIndex == 6) settings_cycleMealReminder();
    }

  } else if (ev == TOUCH_DOUBLE_TAP) {
    if (!isSubOptionOpen) {
      if (settingsMenuIndex == 0) {
        // Play Game -> start Dino game!
        dino_startNewGame();
        transitionTo(STATE_DINO_GAME, 0);
      } else {
        // Enter sub-option editor
        isSubOptionOpen = true;
      }
    } else {
      // Double tap inside sub-option editor -> SAVE & GO BACK to parent menu!
      isSubOptionOpen = false;
      settings_save();
    }

  } else if (ev == TOUCH_LONG_PRESS) {
    isSubOptionOpen = false;
    settings_save();
    transitionTo(STATE_IDLE, 0);
  }
}

void handleTouchEvent(TouchEvent ev) {
  if (ev == TOUCH_NONE) return;

  lastActivityAt = millis();
  faces_glanceAt(0, 6, 500); // brief attentive glance toward the touch sensor

  // Any touch wakes the board first, regardless of what it does next.
  if (currentState == STATE_SLEEPING) {
    transitionTo(STATE_IDLE, 0);
    return;
  }

  if (currentState == STATE_SETTINGS) {
    handleSettingsTouch(ev);
    return;
  }

  if (currentState == STATE_GAME_READY || currentState == STATE_GAME_GO || currentState == STATE_GAME_RESULT) {
    handleGameTouch(ev);
    return;
  }

  if (currentState == STATE_DINO_GAME) {
    if (ev == TOUCH_PRESS_DOWN || ev == TOUCH_SINGLE_TAP || ev == TOUCH_DOUBLE_TAP) {
      dino_jump();
    } else if (ev == TOUCH_LONG_PRESS || ev == TOUCH_HOLD_3SEC) {
      transitionTo(STATE_IDLE, 0);
    }
    return;
  }

  // Double tap while idle / active -> cycle demo expressions
  if (ev == TOUCH_DOUBLE_TAP) {
    cycleDemoExpression();
    return;
  }

  // Single tap while idle / active -> custom tap action
  if (ev == TOUCH_SINGLE_TAP) {
    TouchSingleTapAction action = settings_get().singleTapAction;
    if (action == TAP_ACTION_SHOW_TIME) {
      transitionTo(STATE_SHOW_TIME, 6000);
    } else if (action == TAP_ACTION_PLAY_DINO) {
      dino_startNewGame();
      transitionTo(STATE_DINO_GAME, 0);
    }
    return;
  }

  // Long press while idle / active -> open settings menu
  if (ev == TOUCH_LONG_PRESS) {
    transitionTo(STATE_SETTINGS, 0);
    return;
  }
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------
void transitionTo(DeviceState next, unsigned long durationMs) {
  currentState = next;
  stateEnteredAt = millis();
  temporaryStateDurationMs = durationMs;

  if (next == STATE_SETTINGS) {
    isSubOptionOpen = false;
  }

  // Every time we settle into idle — regardless of what path got us
  // here — the auto-expression timer restarts fresh. This guarantees a
  // full randomized wait rather than firing immediately off a stale
  // schedule left over from before some other state interrupted it.
  if (next == STATE_IDLE) {
    scheduleNextAutoExpression();
  }
}

// Picks a fresh randomized delay (see AUTO_EXPRESSION_MIN_MS/MAX_MS in
// config.h — documented there as the tunable knob for this pacing).
void scheduleNextAutoExpression() {
  nextAutoExpressionAt = millis() + random(AUTO_EXPRESSION_MIN_MS, AUTO_EXPRESSION_MAX_MS + 1);
}

// Picks a random mood (excluding MOOD_DEFAULT, since that's what idle
// already looks like) and — via the history check — never the same mood
// twice in a row, then shows it for a few seconds before auto-reverting
// to idle (which reschedules the next cycle via transitionTo() above).
void triggerRandomAutoExpression() {
  static const EyeMood AUTO_MOOD_POOL[] = {
    MOOD_HAPPY, MOOD_ANGRY, MOOD_SAD, MOOD_SURPRISED, MOOD_CURIOUS,
    MOOD_SKEPTICAL, MOOD_SLEEPY, MOOD_THOUGHTFUL, MOOD_PLAYFUL,
    MOOD_EMBARRASSED, MOOD_SUSPICIOUS, MOOD_CUTE_SMILE, MOOD_DOG,
    MOOD_CAT, MOOD_WINK, MOOD_LOVING, MOOD_DIZZY, MOOD_EXCITED,
    MOOD_SHOCKED, MOOD_CONFUSED
  };
  const int POOL_SIZE = sizeof(AUTO_MOOD_POOL) / sizeof(AUTO_MOOD_POOL[0]);

  EyeMood chosen;
  int attempts = 0;
  do {
    chosen = AUTO_MOOD_POOL[random(0, POOL_SIZE)];
    attempts++;
  } while (chosen == lastAutoMood && attempts < 10); // history buffer of 1 — never repeat immediately

  lastAutoMood = chosen;
  unsigned long holdMs = random(3500, 5500); // how long this expression stays up before reverting
  enterExpression(chosen, holdMs);
}

void updateStateMachine() {
  unsigned long now = millis();

  if (temporaryStateDurationMs > 0 && (now - stateEnteredAt) >= temporaryStateDurationMs) {
    transitionTo(STATE_IDLE, 0);
  }

  // Ambient auto-expression cycling — only while genuinely idle, never
  // interrupting an app-triggered expression, notification, nav, game, etc.
  if (currentState == STATE_IDLE && now >= nextAutoExpressionAt) {
    triggerRandomAutoExpression();
  }

  // Reaction game: once the randomized "get ready" wait elapses, flip to
  // GO and record the exact moment for measuring reaction time.
  if (currentState == STATE_GAME_READY && (now - stateEnteredAt) >= gameGoDelayMs) {
    transitionTo(STATE_GAME_GO, 0);
    gameGoAt = millis();
  }

  // Chrome Dino Elephant Game physics & obstacle update
  if (currentState == STATE_DINO_GAME) {
    dino_update();
  }

  bool interruptible = (currentState == STATE_IDLE);
  unsigned long idleTimeoutMs = (unsigned long)settings_get().idleTimeoutMinutes * 60UL * 1000UL;
  if (interruptible && (now - lastActivityAt) >= idleTimeoutMs) {
    transitionTo(STATE_SLEEPING, 0);
  }
}

void registerLocalActivity() {
  lastActivityAt = millis();
  if (currentState == STATE_SLEEPING) {
    transitionTo(STATE_IDLE, 0);
  }
}

// ---------------------------------------------------------------------------
// Rendering dispatch
// ---------------------------------------------------------------------------
void renderCurrentState() {
  static unsigned long dummyBlink = 0;
  switch (currentState) {
    case STATE_IDLE:            faces_drawIdle(dummyBlink); break;
    case STATE_SLEEPING:        faces_drawSleep(); break;
    case STATE_EXPRESSION:      faces_drawExpression(activeMood); break;
    case STATE_WAVE:            faces_drawWave(); break;
    case STATE_GAME_READY:       faces_drawGameReady(); break;
    case STATE_GAME_GO:          faces_drawGameGo(); break;
    case STATE_GAME_RESULT:      faces_drawGameResult(gameLastReactionMs, gameLastTooSoon); break;
    case STATE_DINO_GAME:        dino_draw(&display); break;
    case STATE_NOTIFICATION:    faces_drawNotification(pendingNotificationText); break;
    case STATE_NAV_LEFT:        faces_drawNavArrow(NAV_DIR_LEFT); break;
    case STATE_NAV_RIGHT:       faces_drawNavArrow(NAV_DIR_RIGHT); break;
    case STATE_NAV_STRAIGHT:    faces_drawNavArrow(NAV_DIR_STRAIGHT); break;
    case STATE_NAV_UTURN:       faces_drawNavArrow(NAV_DIR_UTURN); break;
    case STATE_CUSTOM_DOODLE:   faces_drawCustomDoodle(); break;
    case STATE_SHOW_TIME:       faces_drawClock(deviceId); break;
    case STATE_SETTINGS:        faces_drawSettingsMenu(settingsMenuIndex, isSubOptionOpen); break;
    case STATE_WATER_REMINDER:  faces_drawWaterReminder(); break;
    case STATE_FOOD_REMINDER:   faces_drawFoodReminder(); break;
    default: break;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
String deriveDeviceId() {
  uint64_t mac = ESP.getEfuseMac();
  char buf[14];
  snprintf(buf, sizeof(buf), "0x%08x", (uint32_t)(mac & 0xFFFFFFFF));
  return String(buf);
}
