package com.chotubot.notiflistener;

import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class NotificationListenerModule extends ReactContextBaseJavaModule {

  // Held statically so the NotificationListenerService (which Android
  // instantiates on its own, outside of React's lifecycle) can reach back
  // into JS through whichever React context is currently alive.
  private static ReactApplicationContext reactContext;

  public NotificationListenerModule(ReactApplicationContext context) {
    super(context);
    reactContext = context;
  }

  @NonNull
  @Override
  public String getName() {
    return "NotificationListenerModule";
  }

  @ReactMethod
  public void isPermissionGranted(Promise promise) {
    String enabledListeners = Settings.Secure.getString(
        getReactApplicationContext().getContentResolver(),
        "enabled_notification_listeners"
    );
    String packageName = getReactApplicationContext().getPackageName();
    boolean granted = enabledListeners != null && enabledListeners.contains(packageName);
    promise.resolve(granted);
  }

  @ReactMethod
  public void requestPermission() {
    Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getReactApplicationContext().startActivity(intent);
  }

  static void emitNotificationEvent(String packageName, String title, String text) {
    if (reactContext == null || !reactContext.hasActiveReactInstance()) return;

    WritableMap map = Arguments.createMap();
    map.putString("package", packageName);
    map.putString("title", title);
    map.putString("text", text);

    reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
        .emit("ChotubotNotificationPosted", map);
  }
}
