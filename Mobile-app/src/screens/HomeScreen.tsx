import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { sendCommand, pingDevice, watchDeviceStatus, ExpressionValue } from '../services/commands';
import { startForwardingNotifications, stopForwardingNotifications, ensureNotificationPermission, isForwarding } from '../services/notificationForwarder';
import { theme } from '../theme';

type Props = {
  deviceId: string;
  onOpenDoodle: () => void;
  onUnpair?: () => void;
};

type ExpressionCategory = 'popular' | 'business' | 'emotions' | 'animals' | 'actions';

export default function HomeScreen({ deviceId, onOpenDoodle, onUnpair }: Props) {
  const [status, setStatus] = useState<{ online: boolean; lastSeen: number; firmware: string } | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ExpressionCategory>('popular');
  const [pingText, setPingText] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = watchDeviceStatus(deviceId, setStatus);
    setForwarding(isForwarding());
    return unsubscribe;
  }, [deviceId]);

  const handleConnectivityCheck = async () => {
    setPingText('Pinging...');
    const startMs = Date.now();
    try {
      await pingDevice(deviceId);
      const elapsed = Date.now() - startMs;
      setPingText(`Ping Sent (${elapsed}ms) ✨`);
      setTimeout(() => setPingText(null), 3500);
    } catch (err) {
      setPingText('Ping failed');
      setTimeout(() => setPingText(null), 3500);
    }
  };

  async function toggleForwarding() {
    if (forwarding) {
      stopForwardingNotifications();
      setForwarding(false);
    } else {
      await ensureNotificationPermission();
      startForwardingNotifications(deviceId);
      setForwarding(true);
    }
  }

  const expressionsMap: Record<ExpressionCategory, { label: string; value: ExpressionValue }[]> = {
    popular: [
      { label: '😊 Happy', value: 'happy' },
      { label: '✨ Cute Smile', value: 'cute' },
      { label: '😉 Wink', value: 'wink' },
      { label: '❤️ Loving', value: 'love' },
      { label: '🎮 Playful', value: 'playful' },
      { label: '🖐️ Wave', value: 'wave' },
    ],
    business: [
      { label: '💡 Thoughtful', value: 'thoughtful' },
      { label: '🎧 Listening', value: 'curious' },
      { label: '🤔 Skeptical', value: 'skeptical' },
      { label: '🔥 Excited', value: 'excited' },
    ],
    emotions: [
      { label: '😠 Angry', value: 'angry' },
      { label: '😢 Sad', value: 'sad' },
      { label: '😮 Surprised', value: 'surprised' },
      { label: '😴 Sleepy', value: 'sleepy' },
      { label: '😳 Embarrassed', value: 'embarrassed' },
      { label: '🤨 Suspicious', value: 'suspicious' },
      { label: '😵 Dizzy', value: 'dizzy' },
      { label: '⚡ Shocked', value: 'shocked' },
      { label: '❓ Confused', value: 'confused' },
    ],
    animals: [
      { label: '🐶 Puppy', value: 'dog' },
      { label: '🐱 Kitty', value: 'cat' },
    ],
    actions: [
      { label: '💤 Sleep Mode', value: 'idle' },
      { label: '☀️ Wake Up', value: 'happy' },
    ]
  };

  const isOnline = Boolean(status && (status.online || (status.lastSeen && status.lastSeen > 0)));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header Banner */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.brandTitle}>NANA ROBOT</Text>
          <Text style={styles.deviceSubtitle}>ID: {deviceId}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            style={{ backgroundColor: '#10B981', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}
            onPress={handleConnectivityCheck}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>
              {pingText ? 'TESTING...' : '⚡ TEST CONNECTIVITY'}
            </Text>
          </TouchableOpacity>

          <View style={[styles.statusBadge, { backgroundColor: isOnline ? theme.colors.successBg : 'rgba(100, 116, 139, 0.15)' }]}>
            <View style={[styles.dot, { backgroundColor: isOnline ? theme.colors.success : theme.colors.textMuted }]} />
            <Text style={[styles.statusBadgeText, { color: isOnline ? theme.colors.success : theme.colors.textMuted }]}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>

          {onUnpair && (
            <TouchableOpacity 
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: theme.colors.danger, borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5 }} 
              onPress={onUnpair}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.danger }}>🔗 Unpair</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Prominent Full-Width Connectivity Check Card */}
      <TouchableOpacity 
        style={styles.fullWidthPingCard} 
        onPress={handleConnectivityCheck}
        activeOpacity={0.75}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pingCardTitle}>📡 Test Bot Connectivity</Text>
            <Text style={[styles.pingCardSub, pingText ? { color: theme.colors.success, fontWeight: '700' } : null]}>
              {pingText || 'Tap to ping NANA real-time RTDB stream'}
            </Text>
          </View>
          <View style={[styles.pingBadge, { backgroundColor: '#10B981' }]}>
            <Text style={[styles.pingBadgeText, { color: '#FFFFFF' }]}>
              {pingText ? 'TESTING...' : 'PING ROBOT 🚀'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Quick Action Banner Cards */}
      <View style={styles.bannerRow}>
        <TouchableOpacity style={[styles.actionBanner, { borderLeftColor: theme.colors.accent }]} onPress={onOpenDoodle}>
          <Text style={styles.bannerTitle}>✏️ Doodle Canvas</Text>
          <Text style={styles.bannerSub}>Send 128x64 drawing</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionBanner, { borderLeftColor: theme.colors.amber }]} 
          onPress={() => sendCommand(deviceId, { type: 'game', action: 'dino' })}
        >
          <Text style={styles.bannerTitle}>🦖 Dino Runner</Text>
          <Text style={styles.bannerSub}>Launch game on OLED</Text>
        </TouchableOpacity>
      </View>

      {/* Expression Matrix Category Tabs */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>EXPRESSION COMMAND CENTER</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
          {(['popular', 'business', 'emotions', 'animals'] as ExpressionCategory[]).map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryTab, activeCategory === cat && styles.categoryTabActive]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text style={[styles.categoryTabText, activeCategory === cat && styles.categoryTabTextActive]}>
                {cat.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.grid}>
          {expressionsMap[activeCategory].map((item) => (
            <TouchableOpacity
              key={item.value}
              style={styles.chip}
              onPress={() => sendCommand(deviceId, { type: 'expression', value: item.value })}
            >
              <Text style={styles.chipText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Quick Power Controls */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>DEVICE STATE CONTROLS</Text>
        <View style={styles.row}>
          <TouchableOpacity 
            style={[styles.powerBtn, { backgroundColor: theme.colors.dangerBg, borderColor: theme.colors.danger }]}
            onPress={() => sendCommand(deviceId, { type: 'sleep' })}
          >
            <Text style={[styles.powerBtnText, { color: theme.colors.danger }]}>🌙 Sleep Mode</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.powerBtn, { backgroundColor: theme.colors.successBg, borderColor: theme.colors.success }]}
            onPress={() => sendCommand(deviceId, { type: 'wake' })}
          >
            <Text style={[styles.powerBtnText, { color: theme.colors.success }]}>☀️ Wake Up</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Notification Mirroring Control Card */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>NOTIFICATION MIRRORING</Text>
        <View style={styles.card}>
          <Text style={styles.cardDesc}>
            Mirrors incoming smartphone notifications and Google Maps turn-by-turn navigation directly onto NANA's OLED screen.
          </Text>
          <TouchableOpacity 
            style={[styles.toggleBtn, forwarding ? styles.toggleBtnActive : styles.toggleBtnInactive]} 
            onPress={toggleForwarding}
          >
            <Text style={styles.toggleBtnText}>
              {forwarding ? '🛑 Stop Mirroring' : '🚀 Start Mirroring'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: theme.colors.bg, flexGrow: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  brandTitle: { fontSize: 22, fontWeight: '700', color: theme.colors.text, letterSpacing: 0.5 },
  deviceSubtitle: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  
  fullWidthPingCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.success,
    marginBottom: 16,
  },
  pingCardTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  pingCardSub: { fontSize: 12, color: theme.colors.textSecondary },
  pingBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  pingBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  
  bannerRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionBanner: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderLeftWidth: 4,
  },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  bannerSub: { fontSize: 11, color: theme.colors.textSecondary },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: theme.colors.accent, letterSpacing: 1, marginBottom: 12 },
  
  categoryScroll: { marginBottom: 12 },
  categoryTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    marginRight: 8,
  },
  categoryTabActive: { backgroundColor: theme.colors.accentBg, borderColor: theme.colors.accent },
  categoryTabText: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },
  categoryTabTextActive: { color: theme.colors.accent },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    width: '48%',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: theme.controlRadius,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
  },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.colors.text },

  row: { flexDirection: 'row', gap: 10 },
  powerBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.radius,
    borderWidth: 1,
    alignItems: 'center',
  },
  powerBtnText: { fontSize: 13, fontWeight: '700' },

  card: {
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.card,
    padding: 16,
  },
  cardDesc: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 14, lineHeight: 18 },
  toggleBtn: {
    paddingVertical: 12,
    borderRadius: theme.controlRadius,
    alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: theme.colors.dangerBg, borderWidth: 1, borderColor: theme.colors.danger },
  toggleBtnInactive: { backgroundColor: theme.colors.accentBg, borderWidth: 1, borderColor: theme.colors.accent },
  toggleBtnText: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
});
