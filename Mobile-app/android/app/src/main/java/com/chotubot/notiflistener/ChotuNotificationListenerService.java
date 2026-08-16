package com.chotubot.notiflistener;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import com.facebook.react.modules.core.DeviceEventManagerModule;

// Registered in AndroidManifest.xml with BIND_NOTIFICATION_LISTENER_SERVICE.
// The user must manually enable this under Settings > Notification access —
// Android does not allow granting this permission programmatically, which
// is why NotificationListenerModule.requestPermission() just opens that
// settings screen rather than requesting it inline.
public class ChotuNotificationListenerService extends NotificationListenerService {

  @Override
  public void onNotificationPosted(StatusBarNotification sbn) {
    super.onNotificationPosted(sbn);

    Notification notification = sbn.getNotification();
    if (notification == null) return;
    Bundle extras = notification.extras;
    if (extras == null) return;

    CharSequence titleSeq = extras.getCharSequence(Notification.EXTRA_TITLE);
    CharSequence textSeq = extras.getCharSequence(Notification.EXTRA_TEXT);

    String packageName = sbn.getPackageName();
    String title = titleSeq != null ? titleSeq.toString() : "";
    String text = textSeq != null ? textSeq.toString() : "";

    NotificationListenerModule.emitNotificationEvent(packageName, title, text);
  }

  @Override
  public void onNotificationRemoved(StatusBarNotification sbn) {
    super.onNotificationRemoved(sbn);
    // Not currently forwarded — Chotubot only reacts to new notifications.
  }
}
