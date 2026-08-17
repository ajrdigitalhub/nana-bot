import database from '@react-native-firebase/database';

// Mirrors exactly the JSON shapes the firmware's handleIncomingMessage()
// expects — keep this file and the firmware in sync if the protocol changes.

export type ExpressionValue =
  | 'happy' | 'angry' | 'sad' | 'surprised' | 'curious' | 'skeptical'
  | 'sleepy' | 'thoughtful' | 'playful' | 'embarrassed' | 'suspicious'
  | 'cute' | 'dog' | 'cat' | 'wink' | 'love' | 'dizzy'
  | 'excited' | 'shocked' | 'confused' | 'wave' | 'idle';

export interface DeviceSettings {
  idleMin: number;        // 1, 5, 10, 15
  use24h: boolean;        // true / false
  tapAction: number;      // 0=Clock, 1=Dino, 2=Disabled
  sndMode: number;        // 0=Normal, 1=Mute, 2=Quiet
  waterMin: number;       // 0, 30, 45, 60, 90, 120
  mealHr: number;         // 0, 2, 3, 4, 5
  dinoHi?: number;        // High score
  resetHigh?: boolean;
}

export type ChotubotCommand =
  | { type: 'expression'; value: ExpressionValue; durationMs?: number }
  | { type: 'notification'; title: string; body: string; durationMs?: number }
  | { type: 'nav'; direction: 'left' | 'right' | 'straight' | 'uturn' | 'arrived' }
  | { type: 'sleep' }
  | { type: 'wake' }
  | { type: 'doodle'; bitmapBase64: string; w: number; h: number; durationMs?: number }
  | { type: 'game'; action: 'start' | 'dino' }
  | { type: 'system'; action: 'ping' | 'pong' }
  | ({ type: 'settings' } & Partial<DeviceSettings>);

export async function sendCommand(deviceId: string, command: ChotubotCommand) {
  const path = `/devices/${deviceId}/commands/current`;
  // Send command object directly so Firebase RTDB stores clean JSON object.
  await database().ref(path).set(command);
}

export async function updateDeviceSettings(deviceId: string, settings: Partial<DeviceSettings>) {
  // 1. Send live realtime settings command to device
  await sendCommand(deviceId, { type: 'settings', ...settings });
  // 2. Persist device settings state under /devices/{deviceId}/settings
  await database().ref(`/devices/${deviceId}/settings`).update(settings);
}

export function watchDeviceSettings(
  deviceId: string,
  onChange: (settings: DeviceSettings | null) => void
) {
  const ref = database().ref(`/devices/${deviceId}/settings`);
  const listener = ref.on('value', (snapshot) => {
    onChange(snapshot.val());
  });
  return () => ref.off('value', listener);
}

export async function pingDevice(deviceId: string) {
  return sendCommand(deviceId, { type: 'system', action: 'ping' });
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

export async function checkDeviceExists(deviceId: string): Promise<{ exists: boolean; online: boolean; firmware?: string }> {
  try {
    const snap = await database().ref(`/devices/${deviceId}/status`).once('value');
    if (!snap.exists()) {
      return { exists: false, online: false };
    }
    const val = snap.val() || {};
    return {
      exists: true,
      online: Boolean(val.online),
      firmware: val.firmware || '0.1.0',
    };
  } catch (err) {
    console.warn('Error checking device existence in RTDB:', err);
    return { exists: false, online: false };
  }
}
