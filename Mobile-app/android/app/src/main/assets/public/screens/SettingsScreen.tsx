import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  Platform,
  StatusBar,
  TextInput,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import {
  updateDeviceSettings,
  watchDeviceSettings,
  watchDeviceStatus,
  DeviceSettings,
} from '../services/commands';
import {
  startForwardingNotifications,
  stopForwardingNotifications,
  ensureNotificationPermission,
  isForwarding,
} from '../services/notificationForwarder';
import { theme } from '../theme';

type Props = {
  deviceId: string;
  onUnpair?: () => void;
};

const STATUSBAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 36) + 16 : 16;

const DEFAULT_SETTINGS: DeviceSettings = {
  idleMin: 5,
  use24h: true,
  tapAction: 0,
  sndMode: 0,
  waterMin: 0,
  mealHr: 0,
  dinoHi: 0,
  userName: 'JK',
};

export default function SettingsScreen({ deviceId, onUnpair }: Props) {
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<{ online: boolean; lastSeen: number; firmware: string } | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const [hapticFeedback, setHapticFeedback] = useState(true);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [userNameInput, setUserNameInput] = useState('JK');

  useEffect(() => {
    const unsubStatus = watchDeviceStatus(deviceId, setStatus);
    const unsubSettings = watchDeviceSettings(deviceId, (retrieved) => {
      if (retrieved) {
        setDeviceSettings((prev) => ({ ...prev, ...retrieved }));
        if (retrieved.userName) {
          setUserNameInput(retrieved.userName);
        }
      }
    });
    setForwarding(isForwarding());
    return () => {
      unsubStatus();
      unsubSettings();
    };
  }, [deviceId]);

  const handleUpdate = async (partial: Partial<DeviceSettings>) => {
    const next = { ...deviceSettings, ...partial };
    setDeviceSettings(next);
    try {
      await updateDeviceSettings(deviceId, partial);
      setSaveStatus('Setting synced to robot ✨');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      console.warn('Failed to update device settings:', err);
      setSaveStatus('Error saving setting');
      setTimeout(() => setSaveStatus(null), 2500);
    }
  };

  const toggleForwarding = async () => {
    if (forwarding) {
      stopForwardingNotifications();
      setForwarding(false);
    } else {
      await ensureNotificationPermission();
      startForwardingNotifications(deviceId);
      setForwarding(true);
    }
  };

  const handleResetHighScore = () => {
    Alert.alert(
      'Reset Dino High Score',
      'Are you sure you want to reset the arcade high score on this robot?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await handleUpdate({ resetHigh: true, dinoHi: 0 });
          },
        },
      ]
    );
  };

  const isOnline = Boolean(status && (status.online || (status.lastSeen && status.lastSeen > 0)));

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: STATUSBAR_HEIGHT }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>CONFIG & SETTINGS</Text>
          <Text style={styles.subtitle}>Target Device: {deviceId}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: isOnline ? '#10B98120' : '#EF444420' }]}>
          <View style={[styles.statusDot, { backgroundColor: isOnline ? '#10B981' : '#EF4444' }]} />
          <Text style={[styles.statusText, { color: isOnline ? '#10B981' : '#EF4444' }]}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </Text>
        </View>
      </View>

      {saveStatus && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{saveStatus}</Text>
        </View>
      )}

      {/* SECTION 1: DEVICE FIRMWARE CONTROLS */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeader}>🤖 FIRMWARE HARDWARE CONTROLS</Text>
        <Text style={styles.sectionDesc}>
          Configures preferences directly saved in hardware flash memory on device {deviceId}.
        </Text>

        {/* User Name Config */}
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>👤 User Name (Displayed on Robot Startup)</Text>
          <Text style={styles.settingSubLabel}>Current Greeting: Hi {deviceSettings.userName || 'JK'}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: '#1E293B',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#334155',
                color: '#F8FAFC',
                paddingHorizontal: 12,
                paddingVertical: 8,
                fontSize: 13,
                fontWeight: '600',
              }}
              value={userNameInput}
              onChangeText={setUserNameInput}
              placeholder="Enter name (e.g. JK)"
              placeholderTextColor="#64748B"
              maxLength={14}
            />
            <TouchableOpacity
              style={{
                backgroundColor: theme.colors.accent,
                borderRadius: 10,
                paddingHorizontal: 16,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              onPress={() => handleUpdate({ userName: userNameInput.trim() || 'JK' })}
            >
              <Text style={{ color: '#0F172A', fontWeight: '800', fontSize: 12 }}>SAVE</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sound Mode */}
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Audio & Beep Mode</Text>
          <View style={styles.optionGroup}>
            {[
              { label: '🔊 Normal', val: 0 },
              { label: '🔈 Quiet', val: 2 },
              { label: '🔇 Mute', val: 1 },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.val}
                style={[styles.chip, deviceSettings.sndMode === opt.val && styles.chipActive]}
                onPress={() => handleUpdate({ sndMode: opt.val })}
              >
                <Text style={[styles.chipText, deviceSettings.sndMode === opt.val && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Idle Timeout */}
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Display Sleep Timeout</Text>
          <View style={styles.optionGroup}>
            {[1, 5, 10, 15].map((min) => (
              <TouchableOpacity
                key={min}
                style={[styles.chip, deviceSettings.idleMin === min && styles.chipActive]}
                onPress={() => handleUpdate({ idleMin: min })}
              >
                <Text style={[styles.chipText, deviceSettings.idleMin === min && styles.chipTextActive]}>
                  {min} min
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Time Format */}
        <View style={styles.settingRowBetween}>
          <View>
            <Text style={styles.settingLabel}>Time Clock Format</Text>
            <Text style={styles.settingSubLabel}>
              {deviceSettings.use24h ? '24-Hour (15:45)' : '12-Hour (3:45 PM)'}
            </Text>
          </View>
          <Switch
            value={deviceSettings.use24h}
            onValueChange={(val) => handleUpdate({ use24h: val })}
            trackColor={{ false: '#334155', true: theme.colors.accent }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Single Tap Action */}
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Touch Single-Tap Action</Text>
          <View style={styles.optionGroupVertical}>
            {[
              { label: '🕒 Show Time Clock', val: 0 },
              { label: '🦖 Launch Dino Runner Game', val: 1 },
              { label: '🚫 Disabled', val: 2 },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.val}
                style={[styles.fullChip, deviceSettings.tapAction === opt.val && styles.chipActive]}
                onPress={() => handleUpdate({ tapAction: opt.val })}
              >
                <Text style={[styles.chipText, deviceSettings.tapAction === opt.val && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Water Reminder */}
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>💧 Water Hydration Reminder</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            {[
              { label: 'Off', val: 0 },
              { label: '30m', val: 30 },
              { label: '45m', val: 45 },
              { label: '60m', val: 60 },
              { label: '90m', val: 90 },
              { label: '120m', val: 120 },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.val}
                style={[styles.chip, deviceSettings.waterMin === opt.val && styles.chipActive, { marginRight: 6 }]}
                onPress={() => handleUpdate({ waterMin: opt.val })}
              >
                <Text style={[styles.chipText, deviceSettings.waterMin === opt.val && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Meal Reminder */}
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>🍱 Meal Time Reminder</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            {[
              { label: 'Off', val: 0 },
              { label: '2h', val: 2 },
              { label: '3h', val: 3 },
              { label: '4h', val: 4 },
              { label: '5h', val: 5 },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.val}
                style={[styles.chip, deviceSettings.mealHr === opt.val && styles.chipActive, { marginRight: 6 }]}
                onPress={() => handleUpdate({ mealHr: opt.val })}
              >
                <Text style={[styles.chipText, deviceSettings.mealHr === opt.val && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* High Score Reset */}
        <View style={[styles.settingRowBetween, { marginTop: 12 }]}>
          <View>
            <Text style={styles.settingLabel}>Dino Game High Score</Text>
            <Text style={styles.settingSubLabel}>Current Best: {deviceSettings.dinoHi || 0} pts</Text>
          </View>
          <TouchableOpacity style={styles.dangerBtn} onPress={handleResetHighScore}>
            <Text style={styles.dangerBtnText}>Reset Score</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* SECTION 2: MOBILE APPLICATION PREFERENCES */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeader}>📱 MOBILE APPLICATION SETTINGS</Text>

        {/* Notification Forwarding */}
        <View style={styles.settingRowBetween}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.settingLabel}>Forward Phone Notifications</Text>
            <Text style={styles.settingSubLabel}>
              Push incoming phone calls, SMS & app alerts directly to robot display screen
            </Text>
          </View>
          <Switch
            value={forwarding}
            onValueChange={toggleForwarding}
            trackColor={{ false: '#334155', true: theme.colors.accent }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* App Haptic Feedback */}
        <View style={styles.settingRowBetween}>
          <View>
            <Text style={styles.settingLabel}>App Haptic & Audio Feedback</Text>
            <Text style={styles.settingSubLabel}>Vibrate on mobile button taps</Text>
          </View>
          <Switch
            value={hapticFeedback}
            onValueChange={setHapticFeedback}
            trackColor={{ false: '#334155', true: theme.colors.accent }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Firmware Version Info */}
        <View style={styles.settingRowBetween}>
          <Text style={styles.settingLabel}>Firmware Version</Text>
          <Text style={styles.infoValue}>{status?.firmware || '0.1.0'} (Firebase RTDB)</Text>
        </View>
      </View>

      {/* SECTION 3: DEVICE & ACCOUNT MANAGEMENT */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeader}>🔒 DEVICE & ACCOUNT MANAGEMENT</Text>

        <TouchableOpacity style={styles.actionCard} onPress={onUnpair}>
          <Text style={styles.actionCardTitle}>🔄 Switch / Unpair Active Robot</Text>
          <Text style={styles.actionCardSub}>Disconnect from {deviceId} and pair with another device</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, { marginTop: 10, borderColor: '#EF444440' }]}
          onPress={() => auth().signOut()}
        >
          <Text style={[styles.actionCardTitle, { color: '#EF4444' }]}>🚪 Sign Out of Account</Text>
          <Text style={styles.actionCardSub}>Log out current Firebase user session</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 90 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '800' },

  toast: {
    backgroundColor: theme.colors.accentBg,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
    alignItems: 'center',
  },
  toastText: { color: theme.colors.accent, fontWeight: '600', fontSize: 12 },

  sectionCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.accent,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  sectionDesc: { fontSize: 11, color: theme.colors.textMuted, marginBottom: 14 },

  settingRow: { marginBottom: 14 },
  settingRowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  settingSubLabel: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },

  optionGroup: { flexDirection: 'row', gap: 8, marginTop: 8 },
  optionGroupVertical: { gap: 6, marginTop: 8 },
  chip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  fullChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipActive: {
    backgroundColor: theme.colors.accentBg,
    borderColor: theme.colors.accent,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  chipTextActive: { color: theme.colors.accent, fontWeight: '700' },

  infoValue: { fontSize: 12, color: theme.colors.accent, fontWeight: '600' },

  dangerBtn: {
    backgroundColor: '#EF444420',
    borderColor: '#EF4444',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dangerBtnText: { color: '#EF4444', fontSize: 11, fontWeight: '700' },

  actionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionCardTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  actionCardSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
});
