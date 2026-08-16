import database from '@react-native-firebase/database';

// Mirrors exactly the JSON shapes the firmware's handleIncomingMessage()
// expects — keep this file and the firmware in sync if the protocol changes.

export type ExpressionValue =
  | 'happy' | 'angry' | 'sad' | 'surprised' | 'curious' | 'skeptical'
  | 'sleepy' | 'thoughtful' | 'playful' | 'embarrassed' | 'suspicious'
  | 'cute' | 'dog' | 'cat' | 'wink' | 'love' | 'dizzy'
  | 'excited' | 'shocked' | 'confused' | 'wave' | 'idle';

export type ChotubotCommand =
  | { type: 'expression'; value: ExpressionValue; durationMs?: number }
  | { type: 'notification'; title: string; body: string; durationMs?: number }
  | { type: 'nav'; direction: 'left' | 'right' | 'straight' | 'uturn' | 'arrived' }
  | { type: 'sleep' }
  | { type: 'wake' }
  | { type: 'doodle'; bitmapBase64: string; w: number; h: number; durationMs?: number }
  | { type: 'game'; action: 'start' | 'dino' };

export async function sendCommand(deviceId: string, command: ChotubotCommand) {
  const path = `/devices/${deviceId}/commands/current`;
  // Written as a JSON STRING (not a nested object) — the firmware polls
  // this path with Firebase.RTDB.getString() rather than a realtime
  // stream (a stream task was causing crashes on the ESP32-C3), and
  // getString()/stringData() is the simpler, more reliable API pairing
  // for that. Keep this in sync with pollForCommands() in chotubot.ino.
  await database().ref(path).set(JSON.stringify(command));
}

export function watchDeviceStatus(
  deviceId: string,
  onChange: (status: { online: boolean; lastSeen: number; firmware: string } | null) => void
) {
  const ref = database().ref(`/devices/${deviceId}/status`);
  const listener = ref.on('value', (snapshot) => {
    onChange(snapshot.val());
  });
  return () => ref.off('value', listener);
}

// The reaction game is the one piece of data that flows device -> app
// (everywhere else, data only flows app -> device). The firmware writes
// here directly after each round via pushGameResult() in chotubot.ino.
export function watchGameResult(
  deviceId: string,
  onChange: (result: { reactionMs: number; tooSoon: boolean; playedAt: number } | null) => void
) {
  const ref = database().ref(`/devices/${deviceId}/lastGameResult`);
  const listener = ref.on('value', (snapshot) => {
    onChange(snapshot.val());
  });
  return () => ref.off('value', listener);
}
