import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import functions from '@react-native-firebase/functions';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkDeviceExists } from '../services/commands';
import { theme } from '../theme';

type Props = {
  onPaired: (deviceId: string) => void;
};

const STORAGE_KEY = 'chotubot:pairedDeviceId';

export default function PairingScreen({ onPaired }: Props) {
  const [deviceId, setDeviceId] = useState('');
  const [pairing, setPairing] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  async function pair() {
    const trimmed = deviceId.trim();
    if (!trimmed) {
      setModalError("Please enter a valid Device ID (e.g. 0x0031c15b displayed on NANA's OLED screen).");
      return;
    }
    setPairing(true);
    setModalError(null);
    try {
      // 1. Ensure Firebase authentication exists
      if (!auth().currentUser) {
        try {
          await auth().signInAnonymously();
        } catch (e) {
          console.warn('Anonymous auth prior to pairing skipped/failed:', e);
        }
      }

      // 2. Real Check in Firebase Realtime Database: Check if device exists
      const checkResult = await checkDeviceExists(trimmed);
      if (!checkResult.exists) {
        setModalError(`Device ID '${trimmed}' was not found in Firebase Realtime Database.\n\nPlease check the ID on NANA's OLED screen and ensure the robot is powered on and connected to WiFi.`);
        setPairing(false);
        return;
      }

      // 3. Invoke cloud pairing function — require successful pairing response
      const pairDevice = functions().httpsCallable('pairDevice');
      const res = await pairDevice({ deviceId: trimmed });

      // 4. Confirm pairing response
      if (!res.data || !(res.data as any).paired) {
        setModalError(`Device pairing could not be confirmed for '${trimmed}'. Please ensure NANA robot is powered on and connected to WiFi.`);
        setPairing(false);
        return;
      }

      // 5. Store deviceId locally and enter dashboard ONLY after verified confirmation!
      await AsyncStorage.setItem(STORAGE_KEY, trimmed);
      onPaired(trimmed);
    } catch (err: any) {
      setModalError(err.message ?? "Pairing failed. Please verify NANA robot is powered on and connected to WiFi.");
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

      {/* Styled Error Popup Modal with Close Button */}
      <Modal
        visible={modalError !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setModalError(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>⚠️ Notice</Text>
            <Text style={styles.modalText}>{modalError}</Text>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setModalError(null)}>
              <Text style={styles.modalCloseText}>✖ Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export async function getSavedDeviceId(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY);
}

export async function clearSavedDeviceId(): Promise<void> {
  return AsyncStorage.removeItem(STORAGE_KEY);
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

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    padding: 24,
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 10 },
  modalText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  modalCloseBtn: {
    backgroundColor: theme.colors.cardHover,
    borderColor: theme.colors.cardBorder,
    borderWidth: 1,
    borderRadius: theme.controlRadius,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  modalCloseText: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
});

