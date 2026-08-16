import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import functions from '@react-native-firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../theme';

type Props = {
  onPaired: (deviceId: string) => void;
};

const STORAGE_KEY = 'chotubot:pairedDeviceId';

export default function PairingScreen({ onPaired }: Props) {
  const [deviceId, setDeviceId] = useState('');
  const [pairing, setPairing] = useState(false);

  async function pair() {
    const trimmed = deviceId.trim();
    if (!trimmed) {
      Alert.alert('Enter a device ID', "You'll find this on NANA's OLED boot screen (e.g. 0x0031c15b)");
      return;
    }
    setPairing(true);
    try {
      const pairDevice = functions().httpsCallable('pairDevice');
      await pairDevice({ deviceId: trimmed });
      await AsyncStorage.setItem(STORAGE_KEY, trimmed);
      onPaired(trimmed);
    } catch (err: any) {
      Alert.alert('Pairing failed', err.message ?? String(err));
    } finally {
      setPairing(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>PAIR YOUR NANA ROBOT</Text>
        <Text style={styles.hint}>Enter the Device ID (e.g. 0x0031c15b) displayed on NANA's OLED screen during startup.</Text>
        <TextInput
          style={styles.input}
          value={deviceId}
          onChangeText={setDeviceId}
          placeholder="0x0031c15b"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
        />
        {pairing ? (
          <ActivityIndicator size="large" color={theme.colors.accent} style={{ marginVertical: 10 }} />
        ) : (
          <TouchableOpacity style={styles.button} onPress={pair}>
            <Text style={styles.buttonText}>⚡ Pair & Connect Robot</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export async function getSavedDeviceId(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY);
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: theme.colors.bg },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    padding: 24,
  },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text, textAlign: 'center', letterSpacing: 0.5, marginBottom: 6 },
  hint: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 20, textAlign: 'center', lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.controlRadius,
    padding: 14,
    marginBottom: 16,
    fontSize: 15,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    color: theme.colors.text,
  },
  button: {
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: theme.controlRadius,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: theme.colors.accentBg,
  },
  buttonText: { fontSize: 14, fontWeight: '700', color: theme.colors.accent },
});
