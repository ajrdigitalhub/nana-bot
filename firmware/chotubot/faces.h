/*
 * faces.h — all on-screen drawing, kept separate from networking/state
 * logic in the main .ino.
 *
 * Moods are DATA, not code: _MOOD_TABLE below holds one row per mood
 * (eye height, brow shape, blush, mouth curve, asymmetry...). Adding a new
 * mood is adding one row and one enum value — nothing else needs touching.
 * Every value in a row is eased toward smoothly each frame rather than
 * snapping, and the mouth is drawn as a single connected polyline rather
 * than disconnected pixels.
 *
 * Calibration notes:
 *  - Target framerate is ~20-30fps, not 60 - the realistic ceiling for a
 *    full-buffer I2C flush to this display, still smooth at this size.
 *  - This is a 1-bit monochrome display: no grayscale, so no true
 *    anti-aliasing is physically possible. The mouth's "smoothness" comes
 *    from being one connected polyline instead of separate dots, not from
 *    pixel blending — that's the honest monochrome equivalent.
 *  - "Eye tracking" is simulated attentive glancing (no camera exists on
 *    this board), not real object tracking.
 */
#ifndef CHOTUBOT_FACES_H
#define CHOTUBOT_FACES_H

#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include <time.h>
#include <math.h>
#include <stdlib.h>
#include "mbedtls/base64.h"
#include "config.h"
#include "settings.h"

enum NavDirection {
  NAV_DIR_LEFT,
  NAV_DIR_RIGHT,
  NAV_DIR_STRAIGHT,
  NAV_DIR_UTURN
};

// Adding a mood: append here AND add one row to _MOOD_TABLE below, in the
// same order. That's the whole process.
enum EyeMood {
  MOOD_DEFAULT,
  MOOD_HAPPY,
  MOOD_ANGRY,
  MOOD_SAD,
  MOOD_SURPRISED,
  MOOD_CURIOUS,
  MOOD_SKEPTICAL,
  MOOD_SLEEPY,
  MOOD_THOUGHTFUL,
  MOOD_PLAYFUL,
  MOOD_EMBARRASSED,
  MOOD_SUSPICIOUS,
  MOOD_CUTE_SMILE,
  MOOD_DOG,
  MOOD_CAT,
  MOOD_WINK,
  MOOD_LOVING,
  MOOD_DIZZY,
  MOOD_EXCITED,
  MOOD_SHOCKED,
  MOOD_CONFUSED,
  MOOD_EATING,
  MOOD_COUNT // sentinel — always last, gives the table its size
};

enum LoadingStatus {
  LOAD_PENDING,
  LOAD_PROCESSING,
  LOAD_COMPLETE
};

static Adafruit_SH1106G* _disp = nullptr;

static uint8_t _doodleBuffer[(SCREEN_WIDTH * SCREEN_HEIGHT) / 8];
static int _doodleW = SCREEN_WIDTH;
static int _doodleH = SCREEN_HEIGHT;
static bool _doodleValid = false;

static float _globalExpressionIntensity = 1.0f; // 0.0 to 1.0 intensity scaler

void faces_setIntensity(float intensity) {
  _globalExpressionIntensity = intensity < 0.0f ? 0.0f : (intensity > 1.0f ? 1.0f : intensity);
}

void faces_init(Adafruit_SH1106G* display) {
  _disp = display;
  _disp->setTextColor(SH110X_WHITE);
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
static const int EYE_W_DEFAULT = 24;
static const int EYE_H_DEFAULT = 28;
static const int EYE_RADIUS    = 8;
static const int EYE_GAP       = 14;
static const int EYE_CENTER_Y  = 30;
static const int BROW_GAP_ABOVE_EYE = 6;
static const int MOUTH_Y       = 52;

// ---------------------------------------------------------------------------
// Mood table — one row per EyeMood. This is the entire "personality" of
// each expression; nothing elsewhere needs to change to add a mood.
// ---------------------------------------------------------------------------
struct MoodTargets {
  float height, innerCut, outerCut, smileCut;
  float browAmt, browInnerY, browOuterY, browAsym, eyeAsym;
  float blush, mouthCurve;
};

static const MoodTargets _MOOD_TABLE[MOOD_COUNT] = {
  /* DEFAULT     */ { 1.00f, 0.0f, 0.0f, 0.0f,  0.8f, -2, -1,  0.0f, 0.0f, 0.0f,  0.35f },
  /* HAPPY       */ { 0.85f, 0.0f, 0.0f, 1.0f,  0.8f, -3, -2,  0.0f, 0.0f, 1.0f,  1.00f },
  /* ANGRY       */ { 0.85f, 1.0f, 0.0f, 0.0f,  1.0f,  4, -2,  0.0f, 0.0f, 0.0f, -0.40f },
  /* SAD         */ { 0.75f, 0.0f, 1.0f, 0.0f,  1.0f, -3,  3,  0.0f, 0.0f, 0.0f, -0.70f },
  /* SURPRISED   */ { 1.25f, 0.0f, 0.0f, 0.0f,  0.9f, -5, -5,  0.0f, 0.0f, 0.0f,  0.50f },
  /* CURIOUS     */ { 1.05f, 0.0f, 0.0f, 0.0f,  0.8f, -2, -2,  0.8f, 0.15f,0.0f,  0.30f },
  /* SKEPTICAL   */ { 0.90f, 0.0f, 0.0f, 0.0f,  0.8f,  1, -3, -0.8f,-0.15f,0.0f, -0.20f },
  /* SLEEPY      */ { 0.50f, 0.0f, 0.0f, 0.0f,  0.6f,  2,  2,  0.0f, 0.0f, 0.0f, -0.10f },
  /* THOUGHTFUL  */ { 0.90f, 0.0f, 0.3f, 0.0f,  0.8f, -1,  2,  0.0f, 0.0f, 0.0f, -0.05f },
  /* PLAYFUL     */ { 0.80f, 0.0f, 0.0f, 0.6f,  0.7f, -3, -1,  0.4f, 0.1f, 0.6f,  0.70f },
  /* EMBARRASSED */ { 0.80f, 0.0f, 0.2f, 0.2f,  0.7f, -2,  1,  0.0f, 0.0f, 1.0f,  0.30f },
  /* SUSPICIOUS  */ { 0.75f, 0.3f, 0.0f, 0.0f,  0.9f,  2, -2, -1.0f,-0.2f, 0.0f, -0.20f },
  /* CUTE_SMILE  */ { 0.90f, 0.0f, 0.0f, 0.95f, 0.8f, -3, -2,  0.0f, 0.0f, 1.0f,  1.10f },
  /* DOG         */ { 0.85f, 0.0f, 0.0f, 0.50f, 0.8f, -3, -1,  0.0f, 0.0f, 0.6f,  0.80f },
  /* CAT         */ { 0.80f, 0.0f, 0.0f, 0.60f, 0.8f, -2, -2,  0.0f, 0.0f, 0.7f,  0.90f },
  /* WINK        */ { 0.85f, 0.0f, 0.0f, 0.80f, 0.8f, -3,  0,  0.6f, 0.3f, 0.8f,  1.00f },
  /* LOVING      */ { 1.10f, 0.0f, 0.0f, 0.0f,  0.8f, -3, -3,  0.0f, 0.0f, 1.0f,  1.00f },
  /* DIZZY       */ { 1.00f, 0.0f, 0.0f, 0.0f,  0.7f, -1, -1,  0.0f, 0.0f, 0.0f,  0.00f },
  /* EXCITED     */ { 1.15f, 0.0f, 0.0f, 0.90f, 0.8f, -4, -2,  0.0f, 0.0f, 1.0f,  1.20f },
  /* SHOCKED     */ { 1.30f, 0.0f, 0.0f, 0.0f,  0.9f, -5, -5,  0.0f, 0.0f, 0.0f,  0.00f },
  /* CONFUSED    */ { 0.95f, 0.0f, 0.2f, 0.0f,  0.8f, -4,  2,  0.9f, 0.3f, 0.0f, -0.30f },
  /* EATING      */ { 0.85f, 0.0f, 0.0f, 0.50f, 0.8f, -2, -1,  0.0f, 0.0f, 0.8f,  0.60f },
};

// ---------------------------------------------------------------------------
// Eased ("current") face values - every one chases its mood-table target a
// little closer each frame, which is what produces smooth glides between
// expressions instead of instant snaps.
// ---------------------------------------------------------------------------
static float _curHeight = EYE_H_DEFAULT;
static float _curInnerCut = 0;
static float _curOuterCut = 0;
static float _curSmileCut = 0;
static float _curBrowAmt = 0;
static float _curBrowInnerY = 0;
static float _curBrowOuterY = 0;
static float _curBrowAsym = 0;
static float _curEyeAsym = 0;
static float _curBlushAmt = 0;
static float _curMouthCurve = 0;

static float _curLookX = 0;
static float _curLookY = 0;
static float _lookTargetX = 0;
static float _lookTargetY = 0;
static unsigned long _lookHoldUntil = 0;

// High-speed easing rate (~0.38f) for rapid frame transitions under 150ms
static const float EASE_RATE = 0.38f;

inline float _ease(float current, float target) {
  float diff = target - current;
  if (fabs(diff) < 0.005f) return target;
  return current + diff * EASE_RATE;
}

void faces_glanceAt(float dx, float dy, unsigned long holdMs) {
  _lookTargetX = dx;
  _lookTargetY = dy;
  _lookHoldUntil = millis() + holdMs;
}

// Advances every eased value one step toward the given mood's table row.
void _updateFaceEasing(EyeMood mood) {
  const MoodTargets &t = _MOOD_TABLE[mood];

  _curHeight = _ease(_curHeight, EYE_H_DEFAULT * t.height);
  _curInnerCut = _ease(_curInnerCut, t.innerCut);
  _curOuterCut = _ease(_curOuterCut, t.outerCut);
  _curSmileCut = _ease(_curSmileCut, t.smileCut);
  _curBrowAmt = _ease(_curBrowAmt, t.browAmt);
  _curBrowInnerY = _ease(_curBrowInnerY, t.browInnerY);
  _curBrowOuterY = _ease(_curBrowOuterY, t.browOuterY);
  _curBrowAsym = _ease(_curBrowAsym, t.browAsym);
  _curEyeAsym = _ease(_curEyeAsym, t.eyeAsym);
  _curBlushAmt = _ease(_curBlushAmt, t.blush);
  _curMouthCurve = _ease(_curMouthCurve, t.mouthCurve);

  unsigned long now = millis();
  if (now < _lookHoldUntil) {
    _curLookX = _ease(_curLookX, _lookTargetX);
    _curLookY = _ease(_curLookY, _lookTargetY);
  } else {
    float driftX = (mood == MOOD_DEFAULT) ? (7.0f * sin(now / 1800.0)) : 0;
    float driftY = (mood == MOOD_DEFAULT) ? (2.0f * sin(now / 2600.0)) : 0;
    _curLookX = _ease(_curLookX, driftX);
    _curLookY = _ease(_curLookY, driftY);
  }
}

float _blinkFactor() {
  unsigned long cycle = millis() % 4200;
  if (cycle < 120) {
    float t = cycle / 120.0f;
    return fabs(1.0f - 2.0f * t);
  }
  return 1.0f;
}

// ---------------------------------------------------------------------------
// Eyes
// ---------------------------------------------------------------------------
void _drawOneEye(int cx, int cy, float height, float innerCut, float outerCut,
                  float smileCut, bool mirrored) {
  int w = EYE_W_DEFAULT;
  int h = (int)height;
  if (h < 4) h = 4;

  int x = cx - w / 2;
  int y = cy - h / 2;
  _disp->fillRoundRect(x, y, w, h, EYE_RADIUS, SH110X_WHITE);

  if (innerCut > 0.05f) {
    int bite = (int)(innerCut * (h * 0.7f));
    int innerX = mirrored ? (x + w) : x;
    int dir = mirrored ? -1 : 1;
    _disp->fillTriangle(innerX, y, innerX + dir * bite, y, innerX, y + bite, SH110X_BLACK);
  }
  if (outerCut > 0.05f) {
    int bite = (int)(outerCut * (h * 0.7f));
    int outerX = mirrored ? x : (x + w);
    int dir = mirrored ? 1 : -1;
    _disp->fillTriangle(outerX, y, outerX + dir * bite, y, outerX, y + bite, SH110X_BLACK);
  }
  if (smileCut > 0.05f) {
    int radius = (int)(smileCut * (h * 0.65f));
    _disp->fillCircle(cx, y + h, radius, SH110X_BLACK);
  }

  // Specular Pupil & Catchlight Reflection for organic eye depth
  if (h >= 12 && smileCut < 0.5f && innerCut < 0.5f) {
    int pupilR = 4;
    _disp->fillCircle(cx, cy, pupilR, SH110X_BLACK);
    _disp->drawPixel(cx - 1, cy - 1, SH110X_WHITE); // Specular eye catchlight reflection
  }
}

// ---------------------------------------------------------------------------
// Eyebrows - asymOffset lets one brow sit higher/lower than the other for
// the classic single-raised-eyebrow "curious/skeptical/suspicious" look.
// Only drawn once _curBrowAmt rises above a visibility threshold.
// ---------------------------------------------------------------------------
void _drawOneBrow(int cx, int eyeTopY, float innerY, float outerY, bool mirrored, float asymOffset) {
  int halfW = EYE_W_DEFAULT / 2 + 3;
  int baseY = eyeTopY - BROW_GAP_ABOVE_EYE + (int)asymOffset;
  if (baseY < 2) baseY = 2; // Prevent any eyebrow clipping off screen top

  int innerX = mirrored ? (cx - halfW) : (cx + halfW);
  int outerX = mirrored ? (cx + halfW) : (cx - halfW);

  int y1 = baseY + (int)(mirrored ? outerY : innerY);
  int y2 = baseY + (int)(mirrored ? innerY : outerY);
  int midX = (innerX + outerX) / 2;
  int midY = (y1 + y2) / 2 - 2;

  if (y1 < 1) y1 = 1;
  if (y2 < 1) y2 = 1;
  if (midY < 1) midY = 1;

  _disp->drawLine(innerX, y1, midX, midY, SH110X_WHITE);
  _disp->drawLine(midX, midY, outerX, y2, SH110X_WHITE);
  _disp->drawLine(innerX, y1 + 1, midX, midY + 1, SH110X_WHITE);
  _disp->drawLine(midX, midY + 1, outerX, y2 + 1, SH110X_WHITE);
}

void _drawBrows(int leftCx, int rightCx, int eyeTopY, float browAsym) {
  // Eyebrows are always rendered above eyes across all moods
  float leftOffset = browAsym * 4.0f;
  float rightOffset = -browAsym * 4.0f;
  _drawOneBrow(leftCx, eyeTopY, _curBrowInnerY, _curBrowOuterY, false, leftOffset);
  _drawOneBrow(rightCx, eyeTopY, _curBrowInnerY, _curBrowOuterY, true, rightOffset);
}

// ---------------------------------------------------------------------------
// Blush - "how much" is represented by how many hatch marks are drawn,
// a monochrome stand-in for a gradient since 1-bit can't fade opacity.
// ---------------------------------------------------------------------------
void _drawOneBlush(int cx, int cy, float amount, bool mirrored) {
  int marks = (amount > 0.75f) ? 3 : (amount > 0.45f) ? 2 : (amount > 0.15f) ? 1 : 0;
  int dir = mirrored ? -1 : 1;
  for (int i = 0; i < marks; i++) {
    int ox = dir * (6 + i * 4);
    _disp->drawLine(cx + ox, cy - 2, cx + ox - dir * 3, cy + 2, SH110X_WHITE);
  }
}

void _drawBlush(int leftCx, int rightCx, int cy) {
  if (_curBlushAmt < 0.1f) return;
  _drawOneBlush(leftCx, cy, _curBlushAmt, false);
  _drawOneBlush(rightCx, cy, _curBlushAmt, true);
}

// ---------------------------------------------------------------------------
// Mouth - smooth curve-based mouth engine (parabolic U-smile & frown arcs)
// matching reference design with rounded 3px thick stroke
// ---------------------------------------------------------------------------
void _drawMouth(float curvature, int width = 10) {
  int lookXPx = (int)_curLookX;
  int lookYPx = (int)_curLookY;

  // Dynamic Eye-Mouth Synced Position (85% parallax ratio matching physical depth)
  int mouthCx = SCREEN_WIDTH / 2 + (int)(lookXPx * 0.85f);
  int mouthBaseY = MOUTH_Y + (int)(lookYPx * 0.85f);

  // Render parabolic quadratic curve for all moods (smiles sag down, frowns curve up)
  int prevX = 0, prevY = 0;
  bool havePrev = false;

  for (int dx = -width; dx <= width; dx++) {
    float norm = (float)dx / (float)width;      // -1.0 to +1.0
    float t = 1.0f - (norm * norm);             // 1.0 at center (dx=0), 0.0 at ends (dx=±width)
    int x = mouthCx + dx;

    int y;
    if (curvature >= 0.0f) {
      // Positive curvature -> sag DOWNWARDS below baseline (cute U-smile)
      float maxSag = 5.5f * (curvature > 1.2f ? 1.2f : curvature);
      y = mouthBaseY + (int)(t * maxSag + 0.5f);
    } else {
      // Negative curvature -> curve UPWARDS above baseline (frown)
      float maxSag = 5.5f * (-curvature > 1.2f ? 1.2f : -curvature);
      y = mouthBaseY - (int)(t * maxSag + 0.5f);
    }

    // Draw smooth 3px thick stroke with rounded end-caps using filled circles
    _disp->fillCircle(x, y, 1, SH110X_WHITE);

    if (havePrev) {
      _disp->drawLine(prevX, prevY, x, y, SH110X_WHITE);
      _disp->drawLine(prevX, prevY + 1, x, y + 1, SH110X_WHITE);
      _disp->drawLine(prevX, prevY - 1, x, y - 1, SH110X_WHITE);
    }

    prevX = x;
    prevY = y;
    havePrev = true;
  }
}

// 16x16 Pixel-Perfect Symmetrical Heart Eye Bitmap
static const uint8_t PROGMEM heart_eye_16x16[] = {
  0x38, 0x1C, //   ###       ###
  0x7C, 0x3E, //  #####     #####
  0x7E, 0x7E, // #######   #######
  0xFF, 0xFF, // ################
  0xFF, 0xFF, // ################
  0xFF, 0xFF, // ################
  0x7F, 0xFE, //  ##############
  0x7F, 0xFE, //  ##############
  0x3F, 0xFC, //   ############
  0x1F, 0xF8, //    ##########
  0x0F, 0xF0, //     ########
  0x07, 0xE0, //      ######
  0x03, 0xC0, //       ####
  0x01, 0x80, //        ##
  0x00, 0x00,
  0x00, 0x00
};

// 14x14 Pixel-Perfect Symmetrical Heart Eye Bitmap
static const uint8_t PROGMEM heart_eye_14x14[] = {
  0x38, 0x1C, //   ###       ###
  0x7C, 0x3E, //  #####     #####
  0x7E, 0x7E, // #######   #######
  0xFF, 0xFF, // ################
  0xFF, 0xFF, // ################
  0x7F, 0xFE, //  ##############
  0x3F, 0xFC, //   ############
  0x1F, 0xF8, //    ##########
  0x0F, 0xF0, //     ########
  0x07, 0xE0, //      ######
  0x03, 0xC0, //       ####
  0x01, 0x80, //        ##
  0x00, 0x00,
  0x00, 0x00
};

// 24x24 Waving Hand Animation Frames
static const uint8_t PROGMEM wave_hand_f0[] = {
  0x01, 0x8C, 0x00, 0x03, 0xCE, 0x00, 0x07, 0xFF, 0x00, 0x07, 0xFF, 0x00,
  0x0F, 0xFF, 0x00, 0x1F, 0xFF, 0x80, 0x3F, 0xFF, 0xC0, 0x7F, 0xFF, 0xE0,
  0x7F, 0xFF, 0xE0, 0xFF, 0xFF, 0xF0, 0xFF, 0xFF, 0xF0, 0x7F, 0xFF, 0xF0,
  0x3F, 0xFF, 0xE0, 0x1F, 0xFF, 0xC0, 0x0F, 0xFF, 0x80, 0x07, 0xFF, 0x00,
  0x03, 0xFE, 0x00, 0x01, 0xFC, 0x00, 0x00, 0xF8, 0x00, 0x00, 0xF0, 0x00,
  0x00, 0xE0, 0x00, 0x00, 0xC0, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00
};

static const uint8_t PROGMEM wave_hand_f1[] = {
  0x0F, 0x0F, 0x00, 0x1F, 0x1F, 0x80, 0x1F, 0x1F, 0x80, 0x1F, 0x1F, 0x80,
  0x3F, 0xBF, 0xC0, 0x7F, 0xFF, 0xE0, 0xFF, 0xFF, 0xF0, 0xFF, 0xFF, 0xF0,
  0xFF, 0xFF, 0xF0, 0xFF, 0xFF, 0xF0, 0x7F, 0xFF, 0xE0, 0x7F, 0xFF, 0xE0,
  0x3F, 0xFF, 0xC0, 0x3F, 0xFF, 0xC0, 0x1F, 0xFF, 0x80, 0x1F, 0xFF, 0x80,
  0x0F, 0xFF, 0x00, 0x0F, 0xFF, 0x00, 0x07, 0xFE, 0x00, 0x07, 0xFE, 0x00,
  0x03, 0xFC, 0x00, 0x03, 0xFC, 0x00, 0x01, 0xF8, 0x00, 0x00, 0x00, 0x00
};

static const uint8_t PROGMEM wave_hand_f2[] = {
  0x00, 0x31, 0x80, 0x00, 0x73, 0xC0, 0x00, 0xFF, 0xE0, 0x00, 0xFF, 0xE0,
  0x00, 0xFF, 0xF0, 0x01, 0xFF, 0xF8, 0x03, 0xFF, 0xFC, 0x07, 0xFF, 0xFE,
  0x07, 0xFF, 0xFE, 0x0F, 0xFF, 0xFF, 0x0F, 0xFF, 0xFF, 0x0F, 0xFF, 0xFE,
  0x07, 0xFF, 0xFC, 0x03, 0xFF, 0xF8, 0x01, 0xFF, 0xF0, 0x00, 0xFF, 0xE0,
  0x00, 0x7F, 0xC0, 0x00, 0x3F, 0x80, 0x00, 0x1F, 0x00, 0x00, 0x0F, 0x00,
  0x00, 0x07, 0x00, 0x00, 0x03, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00
};

static void _drawHeart(int cx, int cy, int size) {
  _disp->drawBitmap(cx - 8, cy - 8, heart_eye_16x16, 16, 16, SH110X_WHITE);
}

void _drawBrandWatermark() {
  // Watermark text removed so only face reaction is shown
}

// ---------------------------------------------------------------------------
// Top-level face renderer - handles easing, blinking, glance offset, eye
// asymmetry, and draws eyes + brows + blush; callers add mouth + watermark.
// ---------------------------------------------------------------------------
void _drawFace(EyeMood mood) {
  _updateFaceEasing(mood);
  float blink = _blinkFactor();
  float baseHeight = _curHeight * blink;

  // Eye asymmetry: one eye slightly larger/smaller than the other.
  float leftHeight = baseHeight * (1.0f - _curEyeAsym * 0.25f);
  float rightHeight = baseHeight * (1.0f + _curEyeAsym * 0.25f);

  int lookXPx = (int)_curLookX;
  int lookYPx = (int)_curLookY;
  int leftCx = SCREEN_WIDTH / 2 - (EYE_W_DEFAULT / 2 + EYE_GAP / 2) + lookXPx;
  int rightCx = SCREEN_WIDTH / 2 + (EYE_W_DEFAULT / 2 + EYE_GAP / 2) + lookXPx;
  int eyeCy = EYE_CENTER_Y + lookYPx;

  _drawOneEye(leftCx, eyeCy, leftHeight, _curInnerCut, _curOuterCut, _curSmileCut, false);
  _drawOneEye(rightCx, eyeCy, rightHeight, _curInnerCut, _curOuterCut, _curSmileCut, true);
  _drawBrows(leftCx, rightCx, eyeCy - (int)baseHeight / 2, _curBrowAsym);
  _drawBlush(leftCx, rightCx, eyeCy + (int)baseHeight / 2 + 4);
}

// ---------------------------------------------------------------------------
// Boot / status screens
// ---------------------------------------------------------------------------
void faces_drawBootScreen(const String &deviceId) {
  _disp->clearDisplay();
  _disp->setTextSize(1);
  _disp->setCursor(0, 0);
  _disp->println("CHOTUBOT");
  _disp->print("ID: ");
  _disp->println(deviceId);
  _disp->display();
}

void faces_drawStatusText(const char* text) {
  _disp->clearDisplay();
  _disp->setTextSize(1);
  _disp->setCursor(0, SCREEN_HEIGHT / 2 - 4);
  _disp->println(text);
  _disp->display();
}

// Blank screen held for a fixed duration before ANY content appears at
// power-on. This is sequential/blocking, same as the rest of setup() —
// on this single-loop Arduino architecture there's no separate background
// task running yet at this point in boot (WiFi hasn't even been asked to
// start), so there's nothing this delay could actually block; it's purely
// a deliberate pause before the intro begins.
void faces_playInitialDelay(unsigned long durationMs) {
  _disp->clearDisplay();
  _disp->display();
  delay(durationMs);
}

// ---------------------------------------------------------------------------
// Boot sequence, stage 1: branded intro with a particle twinkle background
// and a left-to-right wipe-reveal on each line of text.
// ---------------------------------------------------------------------------
struct _Particle { int8_t x, y; float phase; };
static _Particle _particles[14];
static bool _particlesInited = false;

void _initParticles() {
  for (int i = 0; i < 14; i++) {
    _particles[i].x = rand() % SCREEN_WIDTH;
    _particles[i].y = rand() % SCREEN_HEIGHT;
    _particles[i].phase = (rand() % 100) / 100.0f * 6.28f;
  }
  _particlesInited = true;
}

void _drawParticles(unsigned long elapsedMs) {
  if (!_particlesInited) _initParticles();
  for (int i = 0; i < 14; i++) {
    float twinkle = sin(elapsedMs / 260.0f + _particles[i].phase);
    if (twinkle > 0.2f) {
      _disp->drawPixel(_particles[i].x, _particles[i].y, SH110X_WHITE);
    }
  }
}

void _drawWipeText(const char* text, int x, int y, float localT, uint8_t textSize) {
  if (localT <= 0) return;
  _disp->setTextSize(textSize);
  int16_t bx, by; uint16_t bw, bh;
  _disp->getTextBounds(text, x, y, &bx, &by, &bw, &bh);
  _disp->setCursor(x, y);
  _disp->print(text);
  if (localT < 1.0f) {
    int revealW = (int)(bw * localT);
    _disp->fillRect(bx + revealW, by, (bw - revealW) + 1, bh + 1, SH110X_BLACK);
  }
}

inline float _clamp01(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

// 12x12 Vintage Nokia Icons for Settings Menu
static const uint8_t PROGMEM icon_nokia_game[] = {
  0x07, 0x00, 0x07, 0x40, 0x07, 0xE0, 0x03, 0xE0,
  0x0F, 0xC0, 0x1F, 0x80, 0x3F, 0x00, 0x3E, 0x00,
  0x1C, 0x00, 0x14, 0x00, 0x14, 0x00, 0x12, 0x00
};

static const uint8_t PROGMEM icon_nokia_sound[] = {
  0x0E, 0x00, 0x1E, 0x40, 0x3E, 0xA0, 0x7F, 0x10,
  0x7F, 0x10, 0x7F, 0x10, 0x3E, 0xA0, 0x1E, 0x40,
  0x0E, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};

static const uint8_t PROGMEM icon_nokia_clock[] = {
  0x1F, 0x00, 0x30, 0x80, 0x61, 0x80, 0x43, 0x00,
  0x46, 0x00, 0x44, 0x00, 0x40, 0x00, 0x60, 0x80,
  0x30, 0x80, 0x1F, 0x00, 0x00, 0x00, 0x00, 0x00
};

static const uint8_t PROGMEM icon_nokia_timefmt[] = {
  0x7F, 0xE0, 0x40, 0x20, 0x7F, 0xE0, 0x40, 0x20,
  0x49, 0x20, 0x49, 0x20, 0x55, 0x20, 0x55, 0x20,
  0x40, 0x20, 0x7F, 0xE0, 0x00, 0x00, 0x00, 0x00
};

static const uint8_t PROGMEM icon_nokia_touch[] = {
  0x0C, 0x00, 0x0C, 0x00, 0x0C, 0x00, 0x0C, 0x00,
  0x0D, 0xB0, 0x1D, 0xB8, 0x3F, 0xF8, 0x3F, 0xF8,
  0x1F, 0xF0, 0x0F, 0xE0, 0x07, 0xC0, 0x00, 0x00
};

static const uint8_t PROGMEM icon_nokia_water[] = {
  0x1F, 0xF0, 0x1F, 0xF0, 0x10, 0x10, 0x10, 0x10,
  0x1F, 0xF0, 0x1F, 0xF0, 0x0F, 0xE0, 0x0F, 0xE0,
  0x0F, 0xE0, 0x07, 0xC0, 0x00, 0x00, 0x00, 0x00
};

static const uint8_t PROGMEM icon_nokia_food[] = {
  0x12, 0x40, 0x24, 0x80, 0x12, 0x40, 0x00, 0x00,
  0x7F, 0xE0, 0xFF, 0xF0, 0xFF, 0xF0, 0x7F, 0xE0,
  0x3F, 0xC0, 0x1F, 0x80, 0x00, 0x00, 0x00, 0x00
};

// 12x18 Rocket Sprite Bitmaps
static const uint8_t PROGMEM rocket_bitmap[] = {
  0x06, 0x00, //      ##
  0x0F, 0x00, //     ####
  0x1F, 0x80, //    ######
  0x1F, 0x80, //    ######
  0x19, 0x80, //    ##  ##
  0x19, 0x80, //    ##  ##
  0x1F, 0x80, //    ######
  0x1F, 0x80, //    ######
  0x3F, 0xC0, //   ########
  0x7F, 0xE0, //  ##########
  0xFF, 0xF0, // ############
  0xDF, 0xB0, // ## ###### ##
  0x9F, 0x90, // #  ######  #
  0x8F, 0x10, // #   ####   #
  0x06, 0x00  //      ##
};

inline void _getPerimeterPoint(int dist, int &outX, int &outY) {
  dist = (dist % 384 + 384) % 384;
  if (dist < 128) {
    outX = dist;
    outY = 0;
  } else if (dist < 192) {
    outX = 127;
    outY = dist - 128;
  } else if (dist < 320) {
    outX = 127 - (dist - 192);
    outY = 63;
  } else {
    outX = 0;
    outY = 63 - (dist - 320);
  }
}

inline void _drawBorderSnake(unsigned long elapsedMs, int snakeLength = 14) {
  int headDist = (int)((elapsedMs / 5) % 384);
  for (int i = 0; i < snakeLength; i++) {
    int x, y;
    _getPerimeterPoint(headDist - i, x, y);
    _disp->drawPixel(x, y, SH110X_WHITE);
  }
}

void _drawCursiveNana(float progress) {
  _disp->setTextSize(2);
  _disp->setTextColor(SH110X_WHITE);

  int letterCount = (int)(progress * 4.0f + 0.95f);
  if (letterCount > 4) letterCount = 4;

  const char* fullText = "Nana";
  char textBuf[5] = "";
  for (int i = 0; i < letterCount && i < 4; i++) {
    textBuf[i] = fullText[i];
  }
  textBuf[letterCount] = '\0';

  _disp->setCursor(26, 20);
  _disp->print(textBuf);

  if (progress > 0.6f) {
    _disp->fillCircle(58, 14, 2, SH110X_WHITE);
    _disp->drawPixel(58, 11, SH110X_WHITE);
    _disp->drawPixel(58, 17, SH110X_WHITE);
    _disp->drawPixel(55, 14, SH110X_WHITE);
    _disp->drawPixel(61, 14, SH110X_WHITE);
  }
}

void faces_playBootIntro() {
  // Step 1 -> Cursive NANA Logo (0 to 1800ms)
  // Step 2 & 3 -> Information Slide 1 with Typewriter + 2.0s Hold (1800 to 4200ms)
  // Step 4 -> Information Slide 2 with Typewriter + 2.0s Hold (4200 to 6600ms)
  // Step 5 -> Main Firmware Page
  const unsigned long DURATION = 6600;
  unsigned long start = millis();

  while (millis() - start < DURATION) {
    unsigned long elapsed = millis() - start;
    _disp->clearDisplay();

    // Animated snake indicator moving around the border
    _drawBorderSnake(elapsed, 14);

    if (elapsed < 1800) {
      // STEP 1: Cursive NANA logo progressive drawing reveal
      float progress = (float)elapsed / 1500.0f;
      if (progress > 1.0f) progress = 1.0f;

      _drawCursiveNana(progress);

      if (elapsed > 900) {
        _disp->setTextSize(1);
        _disp->setCursor(20, 44);
        const char* tag = "AI COMPANION";
        int len = strlen(tag);
        int chars = (int)((elapsed - 900) / 60);
        if (chars > len) chars = len;
        char tagBuf[16] = "";
        strncpy(tagBuf, tag, chars);
        tagBuf[chars] = '\0';
        _disp->print(tagBuf);
      }

    } else if (elapsed < 4200) {
      // STEP 2 & 3: Information Slide 1 (Typewriter reveal + 2.0s hold)
      unsigned long s1Elapsed = elapsed - 1800;

      _disp->setTextSize(1);
      _disp->setTextColor(SH110X_WHITE);

      _disp->setCursor(14, 8);
      _disp->print("NANA ROBOT V2.0");
      _disp->drawFastHLine(12, 18, SCREEN_WIDTH - 24, SH110X_WHITE);

      const char* l1 = "Your Smart Desktop";
      int len1 = strlen(l1);
      int chars1 = (int)(s1Elapsed / 35);
      if (chars1 > len1) chars1 = len1;
      char buf1[24] = ""; strncpy(buf1, l1, chars1); buf1[chars1] = '\0';

      _disp->setCursor(10, 24);
      _disp->print(buf1);

      if (s1Elapsed > 350) {
        unsigned long s1b = s1Elapsed - 350;
        const char* l2 = "AI Companion!";
        int len2 = strlen(l2);
        int chars2 = (int)(s1b / 35);
        if (chars2 > len2) chars2 = len2;
        char buf2[20] = ""; strncpy(buf2, l2, chars2); buf2[chars2] = '\0';

        _disp->setCursor(24, 40);
        _disp->print(buf2);
      }

    } else {
      // STEP 4: Information Slide 2 (Typewriter reveal + 2.0s hold)
      unsigned long s2Elapsed = elapsed - 4200;

      _disp->drawRoundRect(6, 6, SCREEN_WIDTH - 12, 52, 4, SH110X_WHITE);

      _disp->setTextSize(1);
      _disp->setTextColor(SH110X_WHITE);

      const char* sub1 = "POWERED BY";
      int len1 = strlen(sub1);
      int chars1 = (int)(s2Elapsed / 35);
      if (chars1 > len1) chars1 = len1;
      char buf1[12] = ""; strncpy(buf1, sub1, chars1); buf1[chars1] = '\0';

      _disp->setCursor(34, 14);
      _disp->print(buf1);

      if (s2Elapsed > 300) {
        unsigned long s2b = s2Elapsed - 300;
        const char* sub2 = "AJR GROUPS";
        int len2 = strlen(sub2);
        int chars2 = (int)(s2b / 35);
        if (chars2 > len2) chars2 = len2;
        char buf2[12] = ""; strncpy(buf2, sub2, chars2); buf2[chars2] = '\0';

        _disp->setCursor(32, 27);
        _disp->print(buf2);
      }

      if (s2Elapsed > 650) {
        unsigned long s2c = s2Elapsed - 650;
        const char* sub3 = "AJR MART PRODUCT";
        int len3 = strlen(sub3);
        int chars3 = (int)(s2c / 30);
        if (chars3 > len3) chars3 = len3;
        char buf3[20] = ""; strncpy(buf3, sub3, chars3); buf3[chars3] = '\0';
        _disp->setCursor(14, 41);
        _disp->print(buf3);
      }
    }

    _disp->display();
    delay(20);
  }
}

void _drawWaveHand(int frameIndex) {
  const uint8_t* frames[3] = { wave_hand_f0, wave_hand_f1, wave_hand_f2 };
  int idx = abs(frameIndex) % 3;
  int cx = (SCREEN_WIDTH - 24) / 2;
  int cy = (SCREEN_HEIGHT - 24) / 2 - 2;
  _disp->drawBitmap(cx, cy, frames[idx], 24, 24, SH110X_WHITE);
}

void faces_drawWave() {
  unsigned long now = millis();
  int frame = (now / 130) % 3;
  _disp->clearDisplay();
  _drawWaveHand(frame);
  _disp->display();
}

void faces_playBootHandshake() {
  const unsigned long DURATION = 3000;
  unsigned long start = millis();
  while (millis() - start < DURATION) {
    unsigned long elapsed = millis() - start;
    int frame = (elapsed / 130) % 3;

    _disp->clearDisplay();
    _drawBorderSnake(elapsed, 12);
    _drawWaveHand(frame);

    char greetingBuf[32];
    snprintf(greetingBuf, sizeof(greetingBuf), "Hi %s ", settings_get().userName);
    int len = strlen(greetingBuf);
    int chars = (int)(elapsed / 60);
    if (chars > len) chars = len;

    char buf[32] = "";
    strncpy(buf, greetingBuf, chars);
    buf[chars] = '\0';

    _disp->setTextSize(1);
    _disp->setCursor(14, 4);
    _disp->print(buf);

    _disp->display();
    delay(20);
  }
}

// ---------------------------------------------------------------------------
// Boot sequence, stage 3: loading bar wired to REAL connection progress.
// Status is a fill PATTERN, not a color (this is a monochrome display).
// ---------------------------------------------------------------------------
void faces_drawLoadingProgress(int percent, const char* label, LoadingStatus status) {
  if (percent < 0) percent = 0;
  if (percent > 100) percent = 100;

  static const char* lastLabel = nullptr;
  static unsigned long labelStartedAt = 0;
  unsigned long now = millis();

  if (lastLabel != label) {
    lastLabel = label;
    labelStartedAt = now;
  }

  int len = strlen(label);
  int chars = (int)((now - labelStartedAt) / 50); // 1 char every 50ms typewriter
  if (chars > len) chars = len;

  char labelBuf[32] = "";
  strncpy(labelBuf, label, chars);
  labelBuf[chars] = '\0';

  _disp->clearDisplay();
  _disp->setTextSize(1);
  _disp->setCursor(0, 2);
  _disp->print(labelBuf);
  if (chars < len && ((now - labelStartedAt) / 100) % 2 == 0) {
    _disp->print("_");
  }

  int barX = 4, barY = 26, barW = SCREEN_WIDTH - 8, barH = 14;
  _disp->drawRoundRect(barX, barY, barW, barH, 3, SH110X_WHITE);

  int innerW = barW - 4;
  int fillW = (int)(innerW * (percent / 100.0f));

  if (status == LOAD_PENDING) {
    unsigned long now = millis();
    int blipW = 10;
    int travel = innerW - blipW;
    int blipX = barX + 2 + (int)((now % 1400) / 1400.0f * travel);
    _disp->fillRect(blipX, barY + 2, blipW, barH - 4, SH110X_WHITE);

  } else if (status == LOAD_PROCESSING) {
    if (fillW > 0) {
      _disp->fillRect(barX + 2, barY + 2, fillW, barH - 4, SH110X_WHITE);
      unsigned long shimmerX = (millis() / 6) % (fillW + 1);
      _disp->fillRect(barX + 2 + shimmerX, barY + 2, 3, barH - 4, SH110X_BLACK);
    }

  } else {
    _disp->fillRoundRect(barX + 2, barY + 2, innerW, barH - 4, 2, SH110X_WHITE);
    int cx = barX + barW + 8, cy = barY + barH / 2;
    _disp->drawLine(cx - 4, cy, cx - 1, cy + 3, SH110X_WHITE);
    _disp->drawLine(cx - 1, cy + 3, cx + 5, cy - 4, SH110X_WHITE);
  }

  _disp->setTextSize(1);
  char pctBuf[6];
  snprintf(pctBuf, sizeof(pctBuf), "%d%%", percent);
  int16_t bx, by; uint16_t bw, bh;
  _disp->getTextBounds(pctBuf, 0, 0, &bx, &by, &bw, &bh);
  _disp->setCursor((SCREEN_WIDTH - bw) / 2, barY + barH + 8);
  _disp->print(pctBuf);

  _disp->display();
}

// ---------------------------------------------------------------------------
// Generic expression renderer — replaces separate faces_drawHappy() /
// faces_drawAngry() / faces_drawSad() functions with one entry point that
// works for all 12 moods (and any future ones, since it just indexes the
// table). Mood-specific one-off accents (e.g. angry's spark marks) are
// handled here via a small per-mood hook rather than separate functions.
// ---------------------------------------------------------------------------
void faces_drawExpression(EyeMood mood) {
  unsigned long now = millis();
  _disp->clearDisplay();
  _drawFace(mood);

  int leftCx = SCREEN_WIDTH / 2 - (EYE_W_DEFAULT / 2 + EYE_GAP / 2);
  int rightCx = SCREEN_WIDTH / 2 + (EYE_W_DEFAULT / 2 + EYE_GAP / 2);

  if (mood == MOOD_DOG) {
    // Cute floppy dog ears on top left & right
    _disp->fillRoundRect(2, 2, 14, 26, 6, SH110X_WHITE);
    _disp->fillRoundRect(SCREEN_WIDTH - 16, 2, 14, 26, 6, SH110X_WHITE);
    // Dog button nose
    _disp->fillRoundRect(SCREEN_WIDTH / 2 - 5, MOUTH_Y - 14, 10, 6, 3, SH110X_WHITE);
    // Cute dog tongue sticking out
    _disp->fillRoundRect(SCREEN_WIDTH / 2 - 3, MOUTH_Y + 2, 6, 7, 3, SH110X_WHITE);
    _drawMouth(_curMouthCurve);

  } else if (mood == MOOD_CAT) {
    // Sharp cute cat ears
    _disp->fillTriangle(6, 0, 30, 0, 18, 16, SH110X_WHITE);
    _disp->fillTriangle(12, 0, 24, 0, 18, 10, SH110X_BLACK);
    _disp->fillTriangle(SCREEN_WIDTH - 30, 0, SCREEN_WIDTH - 6, 0, SCREEN_WIDTH - 18, 16, SH110X_WHITE);
    _disp->fillTriangle(SCREEN_WIDTH - 24, 0, SCREEN_WIDTH - 12, 0, SCREEN_WIDTH - 18, 10, SH110X_BLACK);
    // Whiskers
    _disp->drawLine(0, EYE_CENTER_Y + 2, 18, EYE_CENTER_Y + 6, SH110X_WHITE);
    _disp->drawLine(0, EYE_CENTER_Y + 10, 18, EYE_CENTER_Y + 10, SH110X_WHITE);
    _disp->drawLine(0, EYE_CENTER_Y + 18, 18, EYE_CENTER_Y + 14, SH110X_WHITE);
    _disp->drawLine(SCREEN_WIDTH, EYE_CENTER_Y + 2, SCREEN_WIDTH - 18, EYE_CENTER_Y + 6, SH110X_WHITE);
    _disp->drawLine(SCREEN_WIDTH, EYE_CENTER_Y + 10, SCREEN_WIDTH - 18, EYE_CENTER_Y + 10, SH110X_WHITE);
    _disp->drawLine(SCREEN_WIDTH, EYE_CENTER_Y + 18, SCREEN_WIDTH - 18, EYE_CENTER_Y + 14, SH110X_WHITE);
    // Cute cat nose & :3 mouth
    _disp->fillTriangle(SCREEN_WIDTH / 2 - 3, MOUTH_Y - 8, SCREEN_WIDTH / 2 + 3, MOUTH_Y - 8, SCREEN_WIDTH / 2, MOUTH_Y - 4, SH110X_WHITE);
    _disp->drawCircleHelper(SCREEN_WIDTH / 2 - 4, MOUTH_Y - 3, 5, 4, SH110X_WHITE);
    _disp->drawCircleHelper(SCREEN_WIDTH / 2 + 4, MOUTH_Y - 3, 5, 8, SH110X_WHITE);

  } else if (mood == MOOD_LOVING) {
    // 1. Clear eye background bounding boxes cleanly
    _disp->fillRect(leftCx - EYE_W_DEFAULT / 2 - 2, EYE_CENTER_Y - EYE_H_DEFAULT / 2 - 2, EYE_W_DEFAULT + 4, EYE_H_DEFAULT + 4, SH110X_BLACK);
    _disp->fillRect(rightCx - EYE_W_DEFAULT / 2 - 2, EYE_CENTER_Y - EYE_H_DEFAULT / 2 - 2, EYE_W_DEFAULT + 4, EYE_H_DEFAULT + 4, SH110X_BLACK);

    // 2. Beating heart animation rhythm (alternates between 16x16 and 14x14 bitmaps)
    int animPhase = (now / 200) % 4;
    const uint8_t* heartBmp = (animPhase == 1 || animPhase == 3) ? heart_eye_14x14 : heart_eye_16x16;
    int hW = 16;
    int hH = (heartBmp == heart_eye_14x14) ? 14 : 16;

    _disp->drawBitmap(leftCx - hW / 2, EYE_CENTER_Y - hH / 2, heartBmp, hW, hH, SH110X_WHITE);
    _disp->drawBitmap(rightCx - hW / 2, EYE_CENTER_Y - hH / 2, heartBmp, hW, hH, SH110X_WHITE);

    // 3. Render eyebrow arches above hearts
    _drawBrows(leftCx, rightCx, EYE_CENTER_Y - 15, 0.0f);

    // 4. Render cute blush cheeks
    _drawBlush(leftCx, rightCx, EYE_CENTER_Y + 14);

    // 5. Render smooth parabolic U-smile
    _drawMouth(1.0f);

  } else if (mood == MOOD_WINK) {
    // Winking left eye (cute curved arc)
    _disp->fillRect(leftCx - EYE_W_DEFAULT / 2 - 1, EYE_CENTER_Y - EYE_H_DEFAULT / 2 - 1, EYE_W_DEFAULT + 2, EYE_H_DEFAULT + 2, SH110X_BLACK);
    _disp->drawLine(leftCx - 14, EYE_CENTER_Y + 3, leftCx, EYE_CENTER_Y - 5, SH110X_WHITE);
    _disp->drawLine(leftCx - 14, EYE_CENTER_Y + 4, leftCx, EYE_CENTER_Y - 4, SH110X_WHITE);
    _disp->drawLine(leftCx, EYE_CENTER_Y - 5, leftCx + 14, EYE_CENTER_Y + 3, SH110X_WHITE);
    _disp->drawLine(leftCx, EYE_CENTER_Y - 4, leftCx + 14, EYE_CENTER_Y + 4, SH110X_WHITE);
    _drawMouth(_curMouthCurve);

  } else if (mood == MOOD_CUTE_SMILE) {
    // Cute sparkles in corners & tongue out
    bool pulse = (now % 500) < 250;
    if (pulse) {
      _disp->drawLine(8, 6, 14, 6, SH110X_WHITE);
      _disp->drawLine(11, 3, 11, 9, SH110X_WHITE);
      _disp->drawLine(SCREEN_WIDTH - 14, 6, SCREEN_WIDTH - 8, 6, SH110X_WHITE);
      _disp->drawLine(SCREEN_WIDTH - 11, 3, SCREEN_WIDTH - 11, 9, SH110X_WHITE);
    }
    _drawMouth(_curMouthCurve);
    _disp->fillRoundRect(SCREEN_WIDTH / 2 - 3, MOUTH_Y + 1, 6, 6, 2, SH110X_WHITE);

  } else if (mood == MOOD_DIZZY) {
    // Rotating spiral pupils inside both eyes
    float angle = now / 100.0f;
    int px1 = leftCx + (int)(5 * cos(angle));
    int py1 = EYE_CENTER_Y + (int)(5 * sin(angle));
    int px2 = rightCx + (int)(5 * cos(angle + 3.14f));
    int py2 = EYE_CENTER_Y + (int)(5 * sin(angle + 3.14f));
    _disp->fillCircle(px1, py1, 5, SH110X_BLACK);
    _disp->fillCircle(px1 + 1, py1 - 1, 2, SH110X_WHITE);
    _disp->fillCircle(px2, py2, 5, SH110X_BLACK);
    _disp->fillCircle(px2 + 1, py2 - 1, 2, SH110X_WHITE);
    // Wavy mouth
    int width = 14;
    int prevX = 0, prevY = 0;
    bool havePrev = false;
    for (int dx = -width; dx <= width; dx++) {
      int x = SCREEN_WIDTH / 2 + dx;
      int y = MOUTH_Y + (int)(3 * sin(dx * 0.4f + now / 150.0f));
      if (havePrev) _disp->drawLine(prevX, prevY, x, y, SH110X_WHITE);
      prevX = x; prevY = y; havePrev = true;
    }

  } else if (mood == MOOD_EXCITED) {
    bool pulse = (now % 400) < 200;
    if (pulse) {
      _disp->drawLine(6, 8, 14, 8, SH110X_WHITE);
      _disp->drawLine(10, 4, 10, 12, SH110X_WHITE);
      _disp->drawLine(SCREEN_WIDTH - 14, 8, SCREEN_WIDTH - 6, 8, SH110X_WHITE);
      _disp->drawLine(SCREEN_WIDTH - 10, 4, SCREEN_WIDTH - 10, 12, SH110X_WHITE);
    }
    _drawMouth(1.2f);
    _disp->fillRoundRect(SCREEN_WIDTH / 2 - 4, MOUTH_Y + 1, 8, 7, 3, SH110X_WHITE);

  } else if (mood == MOOD_SHOCKED) {
    _disp->fillCircle(leftCx, EYE_CENTER_Y, 5, SH110X_BLACK);
    _disp->fillCircle(rightCx, EYE_CENTER_Y, 5, SH110X_BLACK);
    _disp->fillCircle(SCREEN_WIDTH / 2, MOUTH_Y - 2, 7, SH110X_WHITE);
    _disp->fillCircle(SCREEN_WIDTH / 2, MOUTH_Y - 2, 5, SH110X_BLACK);

  } else if (mood == MOOD_CONFUSED) {
    _disp->setTextSize(1);
    _disp->setCursor(rightCx + 16, EYE_CENTER_Y - 14);
    _disp->print("?");
    _disp->drawLine(SCREEN_WIDTH / 2 - 10, MOUTH_Y + 4, SCREEN_WIDTH / 2 + 10, MOUTH_Y - 4, SH110X_WHITE);

  } else if (mood == MOOD_SAD) {
    int tearY = ((now % 1600) / 40);
    if (tearY < 20) {
      _disp->fillCircle(leftCx - 8, EYE_CENTER_Y + 8 + tearY, 2, SH110X_WHITE);
    }
    _drawMouth(_curMouthCurve);

  } else if (mood == MOOD_EATING) {
    // Chewing rhythmic animation with puffed cheeks
    float chew = sin(now / 110.0f);
    int mouthW = 10 + (int)(chew * 4.0f);
    _drawMouth(0.6f + chew * 0.3f, mouthW);
    if ((now % 400) < 200) {
      _disp->fillCircle(SCREEN_WIDTH / 2 + 16, MOUTH_Y + 2, 2, SH110X_WHITE);
    }

  } else {
    _drawMouth(_curMouthCurve);
  }

  _drawBrandWatermark();

  // Angry gets small pulsing spark accents once the furrowed brow has
  // mostly settled in, matching the reference "anger marks" look.
  if (mood == MOOD_ANGRY && _curInnerCut > 0.7f) {
    bool pulse = (now % 400) < 200;
    if (pulse) {
      int sx = SCREEN_WIDTH / 2 - (EYE_W_DEFAULT + EYE_GAP / 2) - 6;
      int sy = EYE_CENTER_Y - EYE_H_DEFAULT / 2 - 10;
      _disp->drawLine(sx - 3, sy, sx + 3, sy, SH110X_WHITE);
      _disp->drawLine(sx, sy - 3, sx, sy + 3, SH110X_WHITE);
    }
  }

  _disp->display();
}

void faces_drawIdle(unsigned long &lastBlinkAt) {
  faces_drawExpression(MOOD_DEFAULT);
}

void faces_drawSleep() {
  unsigned long now = millis();
  _curHeight = _ease(_curHeight, 5.0f);
  _curInnerCut = _ease(_curInnerCut, 0);
  _curOuterCut = _ease(_curOuterCut, 0);
  _curSmileCut = _ease(_curSmileCut, 0);
  _curBrowAmt = _ease(_curBrowAmt, 0);
  _curBlushAmt = _ease(_curBlushAmt, 0);

  _disp->clearDisplay();
  int leftCx = SCREEN_WIDTH / 2 - (EYE_W_DEFAULT / 2 + EYE_GAP / 2);
  int rightCx = SCREEN_WIDTH / 2 + (EYE_W_DEFAULT / 2 + EYE_GAP / 2);
  _drawOneEye(leftCx, EYE_CENTER_Y, _curHeight, 0, 0, 0, false);
  _drawOneEye(rightCx, EYE_CENTER_Y, _curHeight, 0, 0, 0, true);
  _drawBrandWatermark();

  _disp->setTextSize(1);
  int cycle = now % 2000;
  int zY = 20 - (cycle / 100);
  if (zY > 0) {
    _disp->setCursor(SCREEN_WIDTH - 26, zY);
    _disp->print("z");
    if (cycle < 1000) _disp->print("Z");
  }
  _disp->display();
}

void faces_drawNotification(const String &text) {
  unsigned long now = millis();
  bool borderPulse = (now % 600) < 300;

  _disp->clearDisplay();
  if (borderPulse) {
    _disp->drawRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, SH110X_WHITE);
  }
  _disp->setTextSize(1);
  _disp->setCursor(4, 4);
  _disp->println("New message:");
  _disp->setCursor(4, 20);
  _disp->println(text);
  _disp->display();
}

// ---------------------------------------------------------------------------
// Navigation arrows
// ---------------------------------------------------------------------------
void faces_drawNavArrow(NavDirection dir) {
  unsigned long now = millis();
  int pulse = (int)(2 * sin(now / 220.0));

  _disp->clearDisplay();
  int cx = SCREEN_WIDTH / 2;
  int cy = SCREEN_HEIGHT / 2;

  switch (dir) {
    case NAV_DIR_STRAIGHT:
      _disp->fillTriangle(cx, cy - 20 - pulse, cx - 12, cy + 6, cx + 12, cy + 6, SH110X_WHITE);
      _disp->fillRect(cx - 4, cy + 4, 8, 16, SH110X_WHITE);
      break;
    case NAV_DIR_LEFT:
      _disp->fillTriangle(cx - 20 - pulse, cy, cx + 4, cy - 12, cx + 4, cy + 12, SH110X_WHITE);
      _disp->fillRect(cx + 2, cy - 4, 16, 8, SH110X_WHITE);
      break;
    case NAV_DIR_RIGHT:
      _disp->fillTriangle(cx + 20 + pulse, cy, cx - 4, cy - 12, cx - 4, cy + 12, SH110X_WHITE);
      _disp->fillRect(cx - 18, cy - 4, 16, 8, SH110X_WHITE);
      break;
    case NAV_DIR_UTURN:
      _disp->drawCircle(cx, cy, 14 + pulse, SH110X_WHITE);
      _disp->fillTriangle(cx - 14, cy, cx - 2, cy - 10, cx - 2, cy + 10, SH110X_WHITE);
      break;
  }
  _disp->display();
}

// ---------------------------------------------------------------------------
// Weather data & dynamic time display
// ---------------------------------------------------------------------------
struct WeatherData {
  bool valid = false;
  int tempC = 0;
  char condition[16] = "Clear";
  char city[20] = "Local";
};

static WeatherData _weatherData;

void faces_setWeather(int tempC, const char* condition, const char* city) {
  _weatherData.tempC = tempC;
  snprintf(_weatherData.condition, sizeof(_weatherData.condition), "%s", condition);
  snprintf(_weatherData.city, sizeof(_weatherData.city), "%s", city);
  _weatherData.valid = true;
}

void faces_drawClock(const String &devId = "") {
  _disp->clearDisplay();

  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 100)) {
    _disp->setTextSize(1);
    _disp->setCursor(2, 16);
    _disp->println("Syncing time...");
    _disp->setCursor(2, 36);
    _disp->print("Device ID:");
    _disp->setCursor(2, 48);
    _disp->print(devId.length() > 0 ? devId : "0x0031c15b");
    _disp->display();
    return;
  }

  // 1. Format Strings
  char dateBuf[16];
  strftime(dateBuf, sizeof(dateBuf), "%d-%m-%Y", &timeinfo);

  char weatherBuf[20];
  if (_weatherData.valid) {
    snprintf(weatherBuf, sizeof(weatherBuf), "%dC %s", _weatherData.tempC, _weatherData.condition);
  } else {
    snprintf(weatherBuf, sizeof(weatherBuf), "--C Clear");
  }

  bool use24h = settings_get().use24HourFormat;
  char mainTimeBuf[8];
  char secBuf[8];
  char ampmBuf[4] = "";

  if (use24h) {
    strftime(mainTimeBuf, sizeof(mainTimeBuf), "%H:%M", &timeinfo);
    strftime(secBuf, sizeof(secBuf), ":%S", &timeinfo);
  } else {
    strftime(mainTimeBuf, sizeof(mainTimeBuf), "%I:%M", &timeinfo);
    strftime(secBuf, sizeof(secBuf), ":%S", &timeinfo);
    strftime(ampmBuf, sizeof(ampmBuf), "%p", &timeinfo);
  }

  // Row 1 (y = 2): Date (Left) & Weather (Right)
  _disp->setTextSize(1);
  _disp->setCursor(2, 2);
  _disp->print(dateBuf);

  int16_t bx, by; uint16_t bw, bh;
  _disp->getTextBounds(weatherBuf, 0, 0, &bx, &by, &bw, &bh);
  _disp->setCursor(SCREEN_WIDTH - (int)bw - 2, 2);
  _disp->print(weatherBuf);

  // Horizontal Separator (y = 12)
  _disp->drawLine(0, 12, SCREEN_WIDTH, 12, SH110X_WHITE);

  // Main Hero Clock Row (y = 17..33): Large HH:MM in Size 2
  _disp->setTextSize(2);
  _disp->getTextBounds(mainTimeBuf, 0, 0, &bx, &by, &bw, &bh);
  int clockX = 10;
  int clockY = 17;
  _disp->setCursor(clockX, clockY);
  _disp->print(mainTimeBuf);

  // Seconds & AM/PM Badges to the right of main time (x = clockX + bw + 6)
  _disp->setTextSize(1);
  int badgeX = clockX + (int)bw + 6;

  // Draw Seconds
  _disp->setCursor(badgeX, clockY);
  _disp->print(secBuf);

  // Draw AM/PM in a filled inverted badge if 12h format
  if (!use24h && strlen(ampmBuf) > 0) {
    _disp->fillRoundRect(badgeX, clockY + 9, 20, 10, 2, SH110X_WHITE);
    _disp->setTextColor(SH110X_BLACK, SH110X_WHITE);
    _disp->setCursor(badgeX + 3, clockY + 10);
    _disp->print(ampmBuf);
    _disp->setTextColor(SH110X_WHITE); // reset color
  }

  // Row 3 (y = 44..62): Sleek Bottom Card Frame displaying Device ID for App Pairing
  _disp->drawRoundRect(2, 44, SCREEN_WIDTH - 4, 18, 4, SH110X_WHITE);
  _disp->setCursor(6, 49);
  _disp->print("ID: ");
  _disp->print(devId.length() > 0 ? devId : "0x0031c15b");

  int16_t bx2, by2; uint16_t bw2, bh2;
  _disp->getTextBounds("OK", 0, 0, &bx2, &by2, &bw2, &bh2);
  _disp->setCursor(SCREEN_WIDTH - (int)bw2 - 8, 49);
  _disp->print("OK");

  _disp->display();
}

void faces_drawWaterReminder() {
  _disp->clearDisplay();

  unsigned long now = millis();
  int fillProgress = (int)((now / 40) % 100); // 0 to 99 percent liquid fill

  // Header Title
  _disp->setTextSize(1);
  _disp->setTextColor(SH110X_WHITE);
  _disp->setCursor(24, 2);
  _disp->print("DRINK WATER!");

  // Draw Tumbler Glass (Center x=64, top Y=14, bottom Y=52)
  _disp->drawLine(48, 14, 80, 14, SH110X_WHITE); // top rim
  _disp->drawLine(48, 14, 52, 52, SH110X_WHITE); // left wall
  _disp->drawLine(80, 14, 76, 52, SH110X_WHITE); // right wall
  _disp->drawLine(52, 52, 76, 52, SH110X_WHITE); // bottom base

  // Liquid Fill Level (y starts at 50 and rises up to 16)
  int fillH = (fillProgress * 34) / 100;
  int fillY = 50 - fillH;
  if (fillY < 16) fillY = 16;

  // Wave surface physics
  int waveY = fillY + (int)(sin((float)now * 0.012f) * 1.5f);

  // Fill liquid block inside glass
  for (int y = waveY; y <= 50; y++) {
    float t = (float)(y - 14) / 38.0f;
    int leftX = 48 + (int)(t * 4.0f);
    int rightX = 80 - (int)(t * 4.0f);
    _disp->drawFastHLine(leftX + 1, y, rightX - leftX - 1, SH110X_WHITE);
  }

  // Rising bubbles inside water
  int b1Y = 50 - ((now / 15) % 32);
  int b2Y = 50 - (((now + 400) / 20) % 32);
  if (b1Y > fillY) _disp->drawPixel(58, b1Y, SH110X_BLACK);
  if (b2Y > fillY) _disp->drawPixel(68, b2Y, SH110X_BLACK);

  // Subtitle
  _disp->setCursor(20, 56);
  _disp->print("STAY HYDRATED!");

  #if defined(SPEAKER_PIN)
  static unsigned long lastWaterChimeMs = 0;
  if (now - lastWaterChimeMs > 3500) {
    lastWaterChimeMs = now;
    if (settings_get().soundMode != SOUND_MUTE) {
      tone(SPEAKER_PIN, 800, 80); delay(90);
      tone(SPEAKER_PIN, 1200, 120);
    }
  }
  #endif

  _disp->display();
}

void faces_drawFoodReminder() {
  _disp->clearDisplay();

  unsigned long now = millis();

  // Header Title
  _disp->setTextSize(1);
  _disp->setTextColor(SH110X_WHITE);
  _disp->setCursor(32, 2);
  _disp->print("MEAL TIME!");

  // Draw Meal Plate (Center x=64, y=44)
  _disp->drawRoundRect(36, 40, 56, 14, 6, SH110X_WHITE); // outer plate
  _disp->drawRoundRect(42, 42, 44, 10, 4, SH110X_WHITE); // inner bowl

  // Draw Meal Food item inside bowl
  _disp->fillRoundRect(50, 36, 28, 8, 3, SH110X_WHITE);

  // Fork on Left side
  _disp->drawLine(26, 32, 26, 50, SH110X_WHITE);
  _disp->drawLine(24, 32, 28, 32, SH110X_WHITE);

  // Spoon on Right side
  _disp->drawLine(102, 32, 102, 50, SH110X_WHITE);
  _disp->drawCircle(102, 32, 3, SH110X_WHITE);

  // Animated Undulating Steam Waves (~ ~ ~ rising upwards y=30 to 14)
  for (int s = 0; s < 3; s++) {
    int steamX = 52 + s * 12;
    int phase = (now / 25 + s * 40) % 20;
    int steamY = 30 - phase;
    int shiftX = (int)(sin(((float)now * 0.01f) + s) * 3.0f);
    _disp->drawPixel(steamX + shiftX, steamY, SH110X_WHITE);
    _disp->drawPixel(steamX + shiftX + 1, steamY - 2, SH110X_WHITE);
    _disp->drawPixel(steamX + shiftX, steamY - 4, SH110X_WHITE);
  }

  // Subtitle
  _disp->setCursor(28, 56);
  _disp->print("TIME TO EAT!");

  #if defined(SPEAKER_PIN)
  static unsigned long lastFoodChimeMs = 0;
  if (now - lastFoodChimeMs > 3500) {
    lastFoodChimeMs = now;
    if (settings_get().soundMode != SOUND_MUTE) {
      tone(SPEAKER_PIN, 523, 70); delay(80); // C5
      tone(SPEAKER_PIN, 659, 70); delay(80); // E5
      tone(SPEAKER_PIN, 784, 120);           // G5
    }
  }
  #endif

  _disp->display();
}

void faces_drawSettingsMenu(int itemIndex, bool isSubOptionOpen = false) {
  _disp->clearDisplay();

  // 1. Vintage Nokia Pixel Frame Border (Double Outer Lines)
  _disp->drawRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, SH110X_WHITE);
  _disp->drawRect(2, 2, SCREEN_WIDTH - 4, SCREEN_HEIGHT - 4, SH110X_WHITE);

  // 2. Vintage Nokia Header Banner (Top Bar)
  _disp->fillRect(3, 3, SCREEN_WIDTH - 6, 12, SH110X_WHITE);
  _disp->setTextColor(SH110X_BLACK, SH110X_WHITE);
  _disp->setTextSize(1);

  if (!isSubOptionOpen) {
    _disp->setCursor(6, 5);
    _disp->print("NANA MENU");

    char counterStr[10];
    sprintf(counterStr, "[%d/%d]", itemIndex + 1, SETTINGS_ITEM_COUNT);
    _disp->setCursor(SCREEN_WIDTH - 44, 5);
    _disp->print(counterStr);
  } else {
    _disp->setCursor(6, 5);
    _disp->print("> SUB OPTION <");
    _disp->setCursor(SCREEN_WIDTH - 44, 5);
    _disp->print("[EDIT]");
  }

  ChotubotSettings &s = settings_get();

  const char* labels[SETTINGS_ITEM_COUNT] = {
    "Play Game",
    "Sound Mode",
    "Idle Timeout",
    "Time Format",
    "Single Tap",
    "Water Rem",
    "Meal Rem"
  };

  const char* soundLabels[] = { "Normal", "Silent", "Quiet" };
  String values[SETTINGS_ITEM_COUNT] = {
    "Dino Run >",
    soundLabels[(int)s.soundMode % 3],
    String(s.idleTimeoutMinutes) + " min",
    s.use24HourFormat ? "24 Hours" : "12 Hours",
    s.singleTapAction == TAP_ACTION_SHOW_TIME ? "Clock" : (s.singleTapAction == TAP_ACTION_PLAY_DINO ? "Game" : "Off"),
    s.waterReminderMinutes == 0 ? "Off" : (String(s.waterReminderMinutes) + " min"),
    s.mealReminderHours == 0 ? "Off" : (String(s.mealReminderHours) + " hrs")
  };

  const uint8_t* icons[SETTINGS_ITEM_COUNT] = {
    icon_nokia_game,
    icon_nokia_sound,
    icon_nokia_clock,
    icon_nokia_timefmt,
    icon_nokia_touch,
    icon_nokia_water,
    icon_nokia_food
  };

  if (!isSubOptionOpen) {
    // -----------------------------------------------------------------------
    // LEVEL 1: Vintage Nokia Main Menu Option Card
    // -----------------------------------------------------------------------
    _disp->drawRoundRect(6, 18, SCREEN_WIDTH - 12, 31, 3, SH110X_WHITE);

    // Draw 12x12 Nokia Bitmap Icon for current option
    _disp->drawBitmap(12, 27, icons[itemIndex], 12, 12, SH110X_WHITE);

    // Option Title & Current Value
    _disp->setTextColor(SH110X_WHITE);
    _disp->setTextSize(1);
    _disp->setCursor(30, 23);
    _disp->print(labels[itemIndex]);

    _disp->setCursor(30, 35);
    if (itemIndex == 0) {
      _disp->print(">> ENTER 2x");
    } else {
      _disp->print("Val: ");
      _disp->print(values[itemIndex]);
    }

    // Right Cursor Arrow
    _disp->setCursor(SCREEN_WIDTH - 16, 28);
    _disp->print(">");

    // Vintage Softkey Action Bar
    _disp->drawLine(3, 50, SCREEN_WIDTH - 4, 50, SH110X_WHITE);
    _disp->setCursor(6, 53);
    _disp->print(itemIndex == 0 ? "2x:PLAY" : "2x:ENTER");
    _disp->setCursor(SCREEN_WIDTH - 52, 53);
    _disp->print("HOLD:EXIT");

  } else {
    // -----------------------------------------------------------------------
    // LEVEL 2: Vintage Nokia Sub-Option Value Editor
    // -----------------------------------------------------------------------
    _disp->drawBitmap(12, 22, icons[itemIndex], 12, 12, SH110X_WHITE);
    _disp->setTextColor(SH110X_WHITE);
    _disp->setTextSize(1);
    _disp->setCursor(30, 22);
    _disp->print(labels[itemIndex]);

    // Value Selector Card: [< VALUE >]
    _disp->fillRoundRect(10, 36, SCREEN_WIDTH - 20, 13, 2, SH110X_WHITE);
    _disp->setTextColor(SH110X_BLACK, SH110X_WHITE);

    String valStr = "< " + values[itemIndex] + " >";
    int16_t bx, by; uint16_t bw, bh;
    _disp->getTextBounds(valStr.c_str(), 0, 0, &bx, &by, &bw, &bh);
    _disp->setCursor((SCREEN_WIDTH - bw) / 2, 39);
    _disp->print(valStr);

    // Vintage Softkey Action Bar
    _disp->drawLine(3, 50, SCREEN_WIDTH - 4, 50, SH110X_WHITE);
    _disp->setTextColor(SH110X_WHITE);
    _disp->setCursor(6, 53);
    _disp->print("1x:CHANGE");
    _disp->setCursor(SCREEN_WIDTH - 50, 53);
    _disp->print("2x:BACK");
  }

  _disp->display();
}

// ---------------------------------------------------------------------------
// Reaction game screens
// ---------------------------------------------------------------------------
void faces_drawGameReady() {
  unsigned long now = millis();
  _disp->clearDisplay();
  float pulse = 0.9f + 0.1f * sin(now / 150.0);
  int leftCx = SCREEN_WIDTH / 2 - (EYE_W_DEFAULT / 2 + EYE_GAP / 2);
  int rightCx = SCREEN_WIDTH / 2 + (EYE_W_DEFAULT / 2 + EYE_GAP / 2);
  _drawOneEye(leftCx, EYE_CENTER_Y, EYE_H_DEFAULT * 0.55f * pulse, 0, 0, 0, false);
  _drawOneEye(rightCx, EYE_CENTER_Y, EYE_H_DEFAULT * 0.55f * pulse, 0, 0, 0, true);

  _disp->setTextSize(1);
  _disp->setCursor(SCREEN_WIDTH / 2 - 30, MOUTH_Y - 4);
  _disp->print("Get ready...");
  _disp->display();
}

void faces_drawGameGo() {
  _disp->clearDisplay();
  _disp->fillScreen(SH110X_WHITE);
  _disp->setTextColor(SH110X_BLACK);
  _disp->setTextSize(3);
  int16_t bx, by; uint16_t bw, bh;
  _disp->getTextBounds("GO!", 0, 0, &bx, &by, &bw, &bh);
  _disp->setCursor((SCREEN_WIDTH - bw) / 2, (SCREEN_HEIGHT - bh) / 2);
  _disp->print("GO!");
  _disp->setTextColor(SH110X_WHITE);
  _disp->display();
}

void faces_drawGameResult(int reactionMs, bool tooSoon) {
  _disp->clearDisplay();

  if (tooSoon) {
    int leftCx = SCREEN_WIDTH / 2 - (EYE_W_DEFAULT / 2 + EYE_GAP / 2);
    int rightCx = SCREEN_WIDTH / 2 + (EYE_W_DEFAULT / 2 + EYE_GAP / 2);
    _drawOneEye(leftCx, EYE_CENTER_Y, EYE_H_DEFAULT * 0.7f, 0, 0.8f, 0, false);
    _drawOneEye(rightCx, EYE_CENTER_Y, EYE_H_DEFAULT * 0.7f, 0, 0.8f, 0, true);
    _disp->setTextSize(1);
    _disp->setCursor(SCREEN_WIDTH / 2 - 28, MOUTH_Y - 2);
    _disp->print("Too soon!");
  } else {
    bool fast = reactionMs < 300;
    int leftCx = SCREEN_WIDTH / 2 - (EYE_W_DEFAULT / 2 + EYE_GAP / 2);
    int rightCx = SCREEN_WIDTH / 2 + (EYE_W_DEFAULT / 2 + EYE_GAP / 2);
    float smile = fast ? 1.0f : 0.3f;
    _drawOneEye(leftCx, EYE_CENTER_Y - 6, EYE_H_DEFAULT * 0.6f, 0, 0, smile, false);
    _drawOneEye(rightCx, EYE_CENTER_Y - 6, EYE_H_DEFAULT * 0.6f, 0, 0, smile, true);

    char buf[8];
    snprintf(buf, sizeof(buf), "%d", reactionMs);
    _disp->setTextSize(2);
    int16_t bx, by; uint16_t bw, bh;
    _disp->getTextBounds(buf, 0, 0, &bx, &by, &bw, &bh);
    _disp->setCursor((SCREEN_WIDTH - bw) / 2, MOUTH_Y - 4);
    _disp->print(buf);
    _disp->setTextSize(1);
    _disp->print(" ms");
  }
  _disp->display();
}

// ---------------------------------------------------------------------------
// Custom doodles
// ---------------------------------------------------------------------------
void faces_setCustomDoodle(const char* base64Data, int w, int h) {
  size_t outLen = 0;
  size_t maxLen = sizeof(_doodleBuffer);
  int ret = mbedtls_base64_decode(_doodleBuffer, maxLen, &outLen,
                                   (const unsigned char*)base64Data, strlen(base64Data));
  if (ret != 0) {
    Serial.println("Doodle base64 decode failed");
    _doodleValid = false;
    return;
  }
  _doodleW = w;
  _doodleH = h;
  _doodleValid = true;
}

void faces_drawCustomDoodle() {
  _disp->clearDisplay();
  if (_doodleValid) {
    int x = (SCREEN_WIDTH - _doodleW) / 2;
    int y = (SCREEN_HEIGHT - _doodleH) / 2;
    _disp->drawBitmap(x, y, _doodleBuffer, _doodleW, _doodleH, SH110X_WHITE);
  } else {
    _disp->setCursor(0, SCREEN_HEIGHT / 2 - 4);
    _disp->println("No doodle");
  }
  _disp->display();
}

// ---------------------------------------------------------------------------
// Animated Chat Message Bubble Rendering
// ---------------------------------------------------------------------------
void faces_drawAnimatedChatBubble(const String &messageText, float animProgress) {
  if (!_disp) return;
  _disp->clearDisplay();

  // Clamp animation progress (0.0 to 1.0)
  float p = animProgress < 0.0f ? 0.0f : (animProgress > 1.0f ? 1.0f : animProgress);
  
  // Full target box geometry
  const int maxW = 120;
  const int maxH = 50;
  const int targetX = (SCREEN_WIDTH - maxW) / 2; // 4
  const int targetY = 4;

  // Scale box according to easing/animProgress
  int currentW = (int)(maxW * p);
  int currentH = (int)(maxH * p);
  if (currentW < 12) currentW = 12;
  if (currentH < 12) currentH = 12;

  int currentX = targetX + (maxW - currentW) / 2;
  int currentY = targetY + (maxH - currentH) / 2;

  // 1. Draw rounded rectangle chat bubble
  _disp->drawRoundRect(currentX, currentY, currentW, currentH, 5, SH110X_WHITE);

  // 2. Draw speech bubble tail pointing down-left
  if (p > 0.4f) {
    int tailX = currentX + 14;
    int tailY = currentY + currentH;
    if (tailY < SCREEN_HEIGHT - 6) {
      _disp->fillTriangle(tailX, tailY - 1, tailX + 8, tailY - 1, tailX - 4, tailY + 5, SH110X_WHITE);
    }
  }

  // 3. Render content inside bubble when popped in (p >= 0.7f)
  if (p >= 0.7f) {
    // Header tag
    _disp->setTextSize(1);
    _disp->setTextColor(SH110X_WHITE);
    _disp->setCursor(currentX + 6, currentY + 4);
    _disp->print("💬 CHATBOT MSG");

    _disp->drawFastHLine(currentX + 4, currentY + 13, currentW - 8, SH110X_WHITE);

    // Word Wrap Message Text (Max 18 chars/line, up to 3 lines)
    int cursorX = currentX + 6;
    int cursorY = currentY + 16;
    int charsPerLine = (currentW - 12) / 6;
    if (charsPerLine < 6) charsPerLine = 6;

    String text = messageText;
    int len = text.length();
    int startIdx = 0;
    int lineCount = 0;

    while (startIdx < len && lineCount < 3) {
      int endIdx = startIdx + charsPerLine;
      if (endIdx > len) endIdx = len;
      else {
        // Break on space if possible
        int spaceIdx = text.lastIndexOf(' ', endIdx);
        if (spaceIdx > startIdx && spaceIdx < endIdx) {
          endIdx = spaceIdx;
        }
      }

      String line = text.substring(startIdx, endIdx);
      line.trim();

      _disp->setCursor(cursorX, cursorY + (lineCount * 10));
      _disp->print(line);

      startIdx = endIdx;
      if (startIdx < len && text.charAt(startIdx) == ' ') startIdx++;
      lineCount++;
    }
  }

  _disp->display();
}

#endif
