/*
 * touch.h — reads the external touch module on TOUCH_PIN and turns raw
 * press/release signals into three distinct gestures the main sketch
 * reacts to: single tap, double tap, and long press.
 */
#ifndef CHOTUBOT_TOUCH_H
#define CHOTUBOT_TOUCH_H

#include <Arduino.h>
#include "config.h"

enum TouchEvent {
  TOUCH_NONE,
  TOUCH_SINGLE_TAP,
  TOUCH_DOUBLE_TAP,
  TOUCH_LONG_PRESS
};

static bool _touchWasPressed = false;
static unsigned long _touchPressedAt = 0;
static bool _longPressFired = false;
static int _pendingTapCount = 0;
static unsigned long _pendingTapWindowEnds = 0;

static const unsigned long TOUCH_LONG_PRESS_MS = 1200;
static const unsigned long TOUCH_DOUBLE_TAP_WINDOW_MS = 350;

inline void touch_init() {
  pinMode(TOUCH_PIN, INPUT);
}

// Call every loop() iteration. Returns TOUCH_NONE almost always; only
// returns an actual event on the frame it's detected.
inline TouchEvent touch_update() {
  bool pressed = digitalRead(TOUCH_PIN) == HIGH; // most touch modules (e.g. TTP223) go HIGH while touched
  unsigned long now = millis();
  TouchEvent result = TOUCH_NONE;

  if (pressed && !_touchWasPressed) {
    // Just pressed down.
    _touchPressedAt = now;
    _longPressFired = false;

  } else if (pressed && _touchWasPressed) {
    // Still held — check if it's crossed the long-press threshold.
    if (!_longPressFired && (now - _touchPressedAt) >= TOUCH_LONG_PRESS_MS) {
      _longPressFired = true;
      _pendingTapCount = 0; // a long press cancels any tap counting in progress
      result = TOUCH_LONG_PRESS;
    }

  } else if (!pressed && _touchWasPressed) {
    // Just released. If this wasn't already consumed as a long press,
    // count it as a tap and start/extend the double-tap window.
    if (!_longPressFired) {
      _pendingTapCount++;
      _pendingTapWindowEnds = now + TOUCH_DOUBLE_TAP_WINDOW_MS;
    }
  }

  // Resolve any pending tap(s) once the double-tap window closes with the
  // finger no longer down (avoids resolving mid-press).
  if (_pendingTapCount > 0 && now >= _pendingTapWindowEnds && !pressed) {
    result = (_pendingTapCount >= 2) ? TOUCH_DOUBLE_TAP : TOUCH_SINGLE_TAP;
    _pendingTapCount = 0;
  }

  _touchWasPressed = pressed;
  return result;
}

#endif
