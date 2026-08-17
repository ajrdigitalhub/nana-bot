import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Linking, Alert, Platform, StatusBar } from 'react-native';
import { sendCommand } from '../services/commands';
import { ensureNotificationPermission, startForwardingNotifications, stopForwardingNotifications, isForwarding } from '../services/notificationForwarder';
import { theme } from '../theme';

type Props = {
  deviceId: string;
};

const STATUSBAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 12 : 12;

export default function NavigateScreen({ deviceId }: Props) {
  const [destination, setDestination] = useState('');
  const [mirroring, setMirroring] = useState(false);

  useEffect(() => {
    setMirroring(isForwarding());
  }, []);

  async function startNavigation() {
    const trimmed = destination.trim();
    if (!trimmed) {
      Alert.alert('Enter a destination', 'Type a place name or address first.');
      return;
    }
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(trimmed)}&travelmode=driving`;
    const geoUrl = `geo:0,0?q=${encodeURIComponent(trimmed)}`;

    try {
      await Linking.openURL(mapsUrl);
    } catch (e1) {
      try {
        await Linking.openURL(geoUrl);
      } catch (e2) {
        Alert.alert("Couldn't open Maps", 'Could not launch Google Maps or web browser.');
      }
    }
  }

  async function toggleMirroring() {
    if (mirroring) {
      stopForwardingNotifications();
      setMirroring(false);
    } else {
      await ensureNotificationPermission();
      startForwardingNotifications(deviceId);
      setMirroring(true);
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: STATUSBAR_HEIGHT }]}>
      <Text style={styles.title}>GPS NAVIGATION MIRROR</Text>
      <Text style={styles.sub}>
        Route Google Maps turn-by-turn navigation arrows directly onto NANA's OLED screen in real-time.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>GOOGLE MAPS NAVIGATION</Text>
        <TextInput
          style={styles.input}
          value={destination}
          onChangeText={setDestination}
          placeholder="Where to? (e.g. Times Square, Airport)"
          placeholderTextColor={theme.colors.textMuted}
        />
        <TouchableOpacity style={styles.navBtn} onPress={startNavigation}>
          <Text style={styles.navBtnText}>🚀 Launch Route in Google Maps</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TURN-BY-TURN HUD MIRRORING</Text>
        <View style={styles.card}>
          <Text style={styles.cardDesc}>
            When navigation is active, turn directions are automatically extracted from notifications and rendered as 3D directional arrows on NANA's display.
          </Text>
          <TouchableOpacity 
            style={[styles.toggleBtn, mirroring ? styles.toggleBtnActive : styles.toggleBtnInactive]} 
            onPress={toggleMirroring}
          >
            <Text style={styles.toggleBtnText}>
              {mirroring ? '🛑 Stop HUD Mirroring' : '✨ Start HUD Mirroring'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>MANUAL DIRECTION ARROW CONTROLS</Text>
        <View style={styles.grid}>
          <TouchableOpacity style={styles.arrowChip} onPress={() => sendCommand(deviceId, { type: 'nav', direction: 'left' })}>
            <Text style={styles.arrowIcon}>⬅️</Text>
            <Text style={styles.arrowText}>Left</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.arrowChip} onPress={() => sendCommand(deviceId, { type: 'nav', direction: 'straight' })}>
            <Text style={styles.arrowIcon}>⬆️</Text>
            <Text style={styles.arrowText}>Straight</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.arrowChip} onPress={() => sendCommand(deviceId, { type: 'nav', direction: 'right' })}>
            <Text style={styles.arrowIcon}>➡️</Text>
            <Text style={styles.arrowText}>Right</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.arrowChip} onPress={() => sendCommand(deviceId, { type: 'nav', direction: 'uturn' })}>
            <Text style={styles.arrowIcon}>↩️</Text>
            <Text style={styles.arrowText}>U-Turn</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.arrowChip} onPress={() => sendCommand(deviceId, { type: 'nav', direction: 'arrived' })}>
            <Text style={styles.arrowIcon}>🏁</Text>
            <Text style={styles.arrowText}>Arrived</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: theme.colors.bg, flexGrow: 1 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text, letterSpacing: 0.5, marginBottom: 4 },
  sub: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 20, lineHeight: 18 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: theme.colors.accent, letterSpacing: 1, marginBottom: 12 },
  
  input: {
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.controlRadius,
    padding: 14,
    marginBottom: 10,
    fontSize: 14,
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
  },
  navBtn: {
    backgroundColor: theme.colors.accentBg,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: theme.controlRadius,
    paddingVertical: 14,
    alignItems: 'center',
  },
  navBtnText: { fontSize: 14, fontWeight: '700', color: theme.colors.accent },

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

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  arrowChip: {
    width: '31%',
    paddingVertical: 14,
    borderRadius: theme.controlRadius,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
  },
  arrowIcon: { fontSize: 20, marginBottom: 4 },
  arrowText: { fontSize: 12, fontWeight: '600', color: theme.colors.text },
});
