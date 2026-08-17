/*
 * dino_game.h — Chrome Dino-style side-scrolling runner game featuring a custom
 * Elephant character, progressive difficulty, score/high-score tracking, 
 * collision detection, and physical speaker integration on Pin 6.
 */
#ifndef CHOTUBOT_DINO_GAME_H
#define CHOTUBOT_DINO_GAME_H

#include <Arduino.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include "config.h"
#include "settings.h"

// ---------------------------------------------------------------------------
// Hardware Pin 6 Speaker Constants & Helper Tones
// ---------------------------------------------------------------------------
#ifndef SPEAKER_PIN
#define SPEAKER_PIN 6
#endif

static bool _dinoSpeakerEnabled = true;

inline void dino_initHardware() {
  pinMode(SPEAKER_PIN, OUTPUT);
  digitalWrite(SPEAKER_PIN, LOW);
}

inline void dino_playJumpSound() {
  if (settings_get().soundMode == SOUND_MUTE) return;
  int freq = (settings_get().soundMode == SOUND_QUIET) ? 400 : 784;
  tone(SPEAKER_PIN, freq, 60);
}

inline void dino_playScoreSound() {
  if (settings_get().soundMode == SOUND_MUTE) return;
  int freq = (settings_get().soundMode == SOUND_QUIET) ? 800 : 1318;
  tone(SPEAKER_PIN, freq, 90);
}

inline void dino_playGameOverSound() {
  if (settings_get().soundMode == SOUND_MUTE) return;
  int freq = (settings_get().soundMode == SOUND_QUIET) ? 150 : 220;
  tone(SPEAKER_PIN, freq, 250);
}

inline void dino_toggleSpeakerMode() {
  _dinoSpeakerEnabled = !_dinoSpeakerEnabled;
  if (_dinoSpeakerEnabled) {
    tone(SPEAKER_PIN, 1046, 120);
  } else {
    tone(SPEAKER_PIN, 300, 150);
  }
}

// ---------------------------------------------------------------------------
// Elephant Sprite & Obstacle Definitions
// ---------------------------------------------------------------------------
static const int DINO_GROUND_Y = 54;
static const int ELEPHANT_W    = 16;
static const int ELEPHANT_H    = 14;

// Custom 16x14 Elephant Player Sprite (frame 1)
static const uint8_t PROGMEM elephant_frame1[] = {
  0b00000111, 0b11000000, //      ######
  0b00001111, 0b11100000, //     ########
  0b00011100, 0b11110000, //    ###  ####
  0b00011101, 0b11110000, //    ### ##### (eye)
  0b00011111, 0b11111000, //    #########
  0b00111111, 0b11111100, //   ###########
  0b01111111, 0b11111110, //  #############
  0b11111111, 0b11111111, // ################
  0b11011111, 0b11111101, // ## ########### # (trunk / tail)
  0b10011111, 0b11110001, // #  #########   #
  0b00011111, 0b11110000, //    #########
  0b00011001, 0b10011000, //    ##  ##  ##   (legs)
  0b00011001, 0b10011000, //    ##  ##  ##
  0b00011000, 0b00011000  //    ##      ##
};

// Custom 16x14 Elephant Player Sprite (frame 2 - walking)
static const uint8_t PROGMEM elephant_frame2[] = {
  0b00000111, 0b11000000,
  0b00001111, 0b11100000,
  0b00011100, 0b11110000,
  0b00011101, 0b11110000,
  0b00011111, 0b11111000,
  0b00111111, 0b11111100,
  0b01111111, 0b11111110,
  0b11111111, 0b11111111,
  0b11011111, 0b11111101,
  0b10011111, 0b11110001,
  0b00011111, 0b11110000,
  0b00001100, 0b01100000, // animated leg stride
  0b00001100, 0b01100000,
  0b00001100, 0b01100000
};

// Cactus Obstacle Types
enum ObstacleType {
  OBS_CACTUS_SINGLE,
  OBS_CACTUS_DOUBLE,
  OBS_BIRD
};

struct Obstacle {
  float x;
  int y;
  int w;
  int h;
  ObstacleType type;
  bool active;
  bool passed;
};

#define MAX_OBSTACLES 3

// ---------------------------------------------------------------------------
// Game Engine Variables
// ---------------------------------------------------------------------------
static float _eleY = DINO_GROUND_Y - ELEPHANT_H;
static float _eleVy = 0.0f;
static bool _eleGrounded = true;
static int _animFrame = 0;

static Obstacle _obstacles[MAX_OBSTACLES];
static float _gameSpeed = 3.2f;
static unsigned long _score = 0;
static int _highScore = 0;
static bool _isGameOver = false;
static bool _isExitConfirmShowing = false;
static unsigned long _lastFrameMs = 0;
static unsigned long _lastSpawnMs = 0;

// ---------------------------------------------------------------------------
// Game Engine Logic
// ---------------------------------------------------------------------------
inline void dino_startNewGame() {
  _eleY = DINO_GROUND_Y - ELEPHANT_H;
  _eleVy = 0.0f;
  _eleGrounded = true;
  _gameSpeed = 3.2f;
  _score = 0;
  _isGameOver = false;
  _isExitConfirmShowing = false;
  _animFrame = 0;

  _highScore = settings_get().dinoHighScore;

  for (int i = 0; i < MAX_OBSTACLES; i++) {
    _obstacles[i].active = false;
    _obstacles[i].passed = false;
  }

  _lastFrameMs = millis();
  _lastSpawnMs = millis();
}

inline void dino_jump() {
  if (_isGameOver) {
    if (_highScore > settings_get().dinoHighScore) {
      settings_get().dinoHighScore = _highScore;
      settings_save();
    }
    dino_startNewGame();
    return;
  }
  if (_eleGrounded) {
    _eleVy = -6.4f; // Responsive smooth jump force
    _eleGrounded = false;
    dino_playJumpSound();
  }
}

// Handlers for touch gestures
inline void dino_handleTap() {
  if (_isExitConfirmShowing) {
    _isExitConfirmShowing = false; // Cancel exit and resume playing
    return;
  }
  dino_jump();
}

// Returns true if caller should exit to STATE_IDLE
inline bool dino_handleLongPress() {
  if (!_isExitConfirmShowing) {
    _isExitConfirmShowing = true; // Open exit confirmation dialog
    return false;
  }
  // Second long press confirms exit
  _isExitConfirmShowing = false;
  return true;
}

inline void dino_spawnObstacle() {
  for (int i = 0; i < MAX_OBSTACLES; i++) {
    if (!_obstacles[i].active) {
      int r = random(0, 100);
      _obstacles[i].x = SCREEN_WIDTH + 10;
      _obstacles[i].active = true;
      _obstacles[i].passed = false;

      if (r < 45) { // Single Cactus
        _obstacles[i].type = OBS_CACTUS_SINGLE;
        _obstacles[i].w = 7;
        _obstacles[i].h = 14;
        _obstacles[i].y = DINO_GROUND_Y - 14;
      } else if (r < 80) { // Double Cactus
        _obstacles[i].type = OBS_CACTUS_DOUBLE;
        _obstacles[i].w = 14;
        _obstacles[i].h = 15;
        _obstacles[i].y = DINO_GROUND_Y - 15;
      } else { // Flying Bird
        _obstacles[i].type = OBS_BIRD;
        _obstacles[i].w = 12;
        _obstacles[i].h = 8;
        _obstacles[i].y = DINO_GROUND_Y - 26; // Requires jumping
      }
      break;
    }
  }
}

inline bool dino_checkCollision(int eleX, int eleY, int eleW, int eleH,
                                int obsX, int obsY, int obsW, int obsH) {
  // Add 2px tolerance padding for realistic hitbox feel
  int pad = 2;
  return (eleX + pad < obsX + obsW - pad &&
          eleX + eleW - pad > obsX + pad &&
          eleY + pad < obsY + obsH - pad &&
          eleY + eleH - pad > obsY + pad);
}

inline void dino_update() {
  if (_isGameOver || _isExitConfirmShowing) return;

  unsigned long now = millis();
  float dt = (now - _lastFrameMs) / 1000.0f;
  if (dt <= 0.0f || dt > 0.08f) dt = 0.025f;
  _lastFrameMs = now;

  // 1. Gravity & Physics
  if (!_eleGrounded) {
    _eleVy += 22.0f * dt; // Gravity
    _eleY += _eleVy;
    if (_eleY >= DINO_GROUND_Y - ELEPHANT_H) {
      _eleY = DINO_GROUND_Y - ELEPHANT_H;
      _eleVy = 0.0f;
      _eleGrounded = true;
    }
  }

  // 2. Score & Progressive Difficulty
  _score++;
  if (_score % 100 == 0 && _score > 0) {
    dino_playScoreSound();
  }

  // Speed scales smoothly over time
  if (_gameSpeed < 7.5f) {
    _gameSpeed += 0.0008f;
  }

  // 3. Obstacle Spawning
  if (now - _lastSpawnMs > random(1400, 2600) - (int)(_gameSpeed * 100)) {
    _lastSpawnMs = now;
    dino_spawnObstacle();
  }

  // 4. Update & Render Obstacles
  int eleX = 14;
  int eleY = (int)_eleY;

  for (int i = 0; i < MAX_OBSTACLES; i++) {
    if (_obstacles[i].active) {
      _obstacles[i].x -= _gameSpeed;

      // Collision Test
      if (dino_checkCollision(eleX, eleY, ELEPHANT_W, ELEPHANT_H,
                              (int)_obstacles[i].x, _obstacles[i].y,
                              _obstacles[i].w, _obstacles[i].h)) {
        _isGameOver = true;
        dino_playGameOverSound();
        if (_score > _highScore) {
          _highScore = _score;
          settings_get().dinoHighScore = _highScore;
        }
        return;
      }

      // Recycle obstacle off-screen
      if (_obstacles[i].x + _obstacles[i].w < 0) {
        _obstacles[i].active = false;
      }
    }
  }

  // 5. Leg Animation Toggle
  if ((now / 120) % 2 == 0) {
    _animFrame = 0;
  } else {
    _animFrame = 1;
  }
}

// ---------------------------------------------------------------------------
// Render Routine (OLED 128x64)
// ---------------------------------------------------------------------------
inline void dino_draw(Adafruit_SH1106G* disp) {
  disp->clearDisplay();

  // 1. Scoreboard (Top Header)
  disp->setTextSize(1);
  disp->setTextColor(SH110X_WHITE);
  disp->setCursor(4, 2);
  disp->print("HI ");
  if (_highScore < 10000) disp->print("0");
  if (_highScore < 1000) disp->print("0");
  if (_highScore < 100) disp->print("0");
  if (_highScore < 10) disp->print("0");
  disp->print(_highScore);

  disp->setCursor(76, 2);
  disp->print("S ");
  if (_score < 10000) disp->print("0");
  if (_score < 1000) disp->print("0");
  if (_score < 100) disp->print("0");
  if (_score < 10) disp->print("0");
  disp->print(_score);

  disp->drawFastHLine(0, 12, SCREEN_WIDTH, SH110X_WHITE);

  // 2. Ground Line with Texture
  disp->drawFastHLine(0, DINO_GROUND_Y, SCREEN_WIDTH, SH110X_WHITE);
  int scrollOffset = (millis() / 20) % 12;
  for (int x = -scrollOffset; x < SCREEN_WIDTH; x += 12) {
    disp->drawPixel(x, DINO_GROUND_Y + 3, SH110X_WHITE);
    disp->drawPixel(x + 5, DINO_GROUND_Y + 6, SH110X_WHITE);
  }

  // 3. Draw Elephant Character
  int eleX = 14;
  int eleY = (int)_eleY;
  const uint8_t* ptr = (_animFrame == 0 || !_eleGrounded) ? elephant_frame1 : elephant_frame2;
  disp->drawBitmap(eleX, eleY, ptr, ELEPHANT_W, ELEPHANT_H, SH110X_WHITE);

  // 4. Draw Obstacles
  for (int i = 0; i < MAX_OBSTACLES; i++) {
    if (_obstacles[i].active) {
      int ox = (int)_obstacles[i].x;
      int oy = _obstacles[i].y;
      int ow = _obstacles[i].w;
      int oh = _obstacles[i].h;

      if (_obstacles[i].type == OBS_CACTUS_SINGLE) {
        disp->fillRect(ox + 2, oy, 3, oh, SH110X_WHITE);
        disp->drawFastHLine(ox, oy + 4, 3, SH110X_WHITE);
        disp->drawFastVLine(ox, oy + 2, 3, SH110X_WHITE);
        disp->drawFastHLine(ox + 4, oy + 7, 3, SH110X_WHITE);
        disp->drawFastVLine(ox + 6, oy + 4, 4, SH110X_WHITE);
      } else if (_obstacles[i].type == OBS_CACTUS_DOUBLE) {
        disp->fillRect(ox + 2, oy, 3, oh, SH110X_WHITE);
        disp->fillRect(ox + 9, oy + 2, 3, oh - 2, SH110X_WHITE);
        disp->drawFastHLine(ox, oy + 5, 3, SH110X_WHITE);
        disp->drawFastVLine(ox, oy + 3, 3, SH110X_WHITE);
        disp->drawFastHLine(ox + 11, oy + 7, 3, SH110X_WHITE);
        disp->drawFastVLine(ox + 13, oy + 4, 4, SH110X_WHITE);
      } else if (_obstacles[i].type == OBS_BIRD) {
        // Animated Flying Bird
        bool wingUp = ((millis() / 150) % 2 == 0);
        disp->fillTriangle(ox, oy + 4, ox + ow, oy + 4, ox + ow / 2, oy + (wingUp ? 0 : 8), SH110X_WHITE);
        disp->drawPixel(ox + ow - 1, oy + 3, SH110X_BLACK); // Bird beak
      }
    }
  }

  // 5. Game Over Screen Overlay
  if (_isGameOver) {
    disp->fillRoundRect(14, 18, 100, 36, 4, SH110X_BLACK);
    disp->drawRoundRect(14, 18, 100, 36, 4, SH110X_WHITE);

    disp->setTextSize(1);
    disp->setCursor(32, 23);
    disp->print("GAME OVER");

    disp->setCursor(24, 38);
    disp->print("TAP TO RESTART");
  }

  // 6. Exit Game Confirmation Modal Overlay
  if (_isExitConfirmShowing) {
    disp->fillRoundRect(12, 12, 104, 44, 4, SH110X_BLACK);
    disp->drawRoundRect(12, 12, 104, 44, 4, SH110X_WHITE);

    disp->setTextSize(1);
    disp->setCursor(32, 17);
    disp->print("EXIT GAME?");

    disp->setCursor(18, 30);
    disp->print("Hold: Confirm Exit");

    disp->setCursor(20, 42);
    disp->print("Tap: Resume Game");
  }

  disp->display();
}

#endif
