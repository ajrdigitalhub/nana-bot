/*
 * settings.h — user-adjustable device settings, persisted in flash (NVS)
 * so they survive power loss / reboots. Adjusted on-device via the touch
 * sensor's long-press settings menu (see touch.h + the STATE_SETTINGS
 * handling in chotubot.ino) — no app or backend involvement needed for this.
 */
#ifndef CHOTUBOT_SETTINGS_H
#define CHOTUBOT_SETTINGS_H

#include <Preferences.h>
#include "config.h"

enum TouchSingleTapAction {
  TAP_ACTION_SHOW_TIME = 0,
  TAP_ACTION_PLAY_DINO = 1,
  TAP_ACTION_DISABLED  = 2,
};

struct ChotubotSettings {
  int idleTimeoutMinutes = IDLE_TIMEOUT_MINUTES_DEFAULT; // cycles: 1, 5, 10, 15
  bool use24HourFormat = true;
  TouchSingleTapAction singleTapAction = TAP_ACTION_SHOW_TIME;
  int dinoHighScore = 0;
};

static ChotubotSettings _settings;
static Preferences _prefs;

inline void settings_load() {
  _prefs.begin("chotubot", false);
  _settings.idleTimeoutMinutes = _prefs.getInt("idleMin", IDLE_TIMEOUT_MINUTES_DEFAULT);
  _settings.use24HourFormat = _prefs.getBool("use24h", true);
  _settings.singleTapAction = (TouchSingleTapAction)_prefs.getInt("tapAction", TAP_ACTION_SHOW_TIME);
  _settings.dinoHighScore = _prefs.getInt("dinoHi", 0);
}

inline void settings_save() {
  _prefs.putInt("idleMin", _settings.idleTimeoutMinutes);
  _prefs.putBool("use24h", _settings.use24HourFormat);
  _prefs.putInt("tapAction", (int)_settings.singleTapAction);
  _prefs.putInt("dinoHi", _settings.dinoHighScore);
}

inline ChotubotSettings& settings_get() {
  return _settings;
}

inline void settings_cycleIdleTimeout() {
  static const int options[] = { 1, 5, 10, 15 };
  int idx = 0;
  for (int i = 0; i < 4; i++) {
    if (options[i] == _settings.idleTimeoutMinutes) idx = i;
  }
  idx = (idx + 1) % 4;
  _settings.idleTimeoutMinutes = options[idx];
}

inline void settings_toggleTimeFormat() {
  _settings.use24HourFormat = !_settings.use24HourFormat;
}

inline void settings_cycleTapAction() {
  if (_settings.singleTapAction == TAP_ACTION_SHOW_TIME) {
    _settings.singleTapAction = TAP_ACTION_PLAY_DINO;
  } else if (_settings.singleTapAction == TAP_ACTION_PLAY_DINO) {
    _settings.singleTapAction = TAP_ACTION_DISABLED;
  } else {
    _settings.singleTapAction = TAP_ACTION_SHOW_TIME;
  }
}

// Number of settings menu items — keep in sync with faces_drawSettingsMenu()
// and the handleSettingsTouch() switch in chotubot.ino if you add more.
#define SETTINGS_ITEM_COUNT 4

#endif
