import { NativeEventEmitter, NativeModules } from 'react-native';
import { sendCommand } from './commands';

const { NotificationListenerModule } = NativeModules;
const emitter = NotificationListenerModule ? new NativeEventEmitter(NotificationListenerModule) : null;

const GOOGLE_MAPS_PACKAGE = 'com.google.android.apps.maps';

// Apps whose notifications are just noise for this use case (the phone's
// own status bar, the OS itself, etc.) — extend as you find more.
const IGNORED_PACKAGES = ['android', 'com.android.systemui'];

let subscription: { remove: () => void } | null = null;

export function isForwarding(): boolean {
  return subscription !== null;
}

type RawNotification = {
  package: string;
  title: string;
  text: string;
};

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!NotificationListenerModule) return false;
  const granted = await NotificationListenerModule.isPermissionGranted();
  if (!granted) {
    // Opens Android's "Notification access" settings screen; the user must
    // manually toggle Chotubot on — Android does not allow granting this
    // permission programmatically.
    NotificationListenerModule.requestPermission();
  }
  return granted;
}

export function startForwardingNotifications(deviceId: string) {
  if (!emitter) {
    console.warn('NotificationListenerModule not available — did you rebuild the Android app?');
    return;
  }

  subscription = emitter.addListener('ChotubotNotificationPosted', (raw: RawNotification) => {
    if (IGNORED_PACKAGES.includes(raw.package)) return;

    if (raw.package === GOOGLE_MAPS_PACKAGE) {
      const direction = parseMapsDirection(raw.text || raw.title);
      if (direction) {
        sendCommand(deviceId, { type: 'nav', direction });
        return;
      }
      // Fall through to a generic notification if we couldn't parse a
      // direction out of it (e.g. "You have arrived", ETA updates, etc.)
      if (/arrived/i.test(raw.text)) {
        sendCommand(deviceId, { type: 'nav', direction: 'arrived' });
        return;
      }
    }

    sendCommand(deviceId, {
      type: 'notification',
      title: raw.title || raw.package,
      body: raw.text || '',
    });
  });
}

export function stopForwardingNotifications() {
  subscription?.remove();
  subscription = null;
}

// Google Maps' navigation notification text is plain-language instructions
// like "Turn left onto MG Road" or "Continue straight for 500 m". This is
// pattern matching against phrasing, not an official API — if Google
// changes the wording this will need updating.
export function parseMapsDirection(
  text: string
): 'left' | 'right' | 'straight' | 'uturn' | null {
  if (!text) return null;
  const t = text.toLowerCase();

  if (t.includes('u-turn') || t.includes('u turn')) return 'uturn';
  if (t.includes('turn left') || t.includes('keep left') || t.includes('exit left')) return 'left';
  if (t.includes('turn right') || t.includes('keep right') || t.includes('exit right')) return 'right';
  if (t.includes('continue') || t.includes('straight') || t.includes('head')) return 'straight';

  return null;
}
