import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import auth from '@react-native-firebase/auth';
import { theme } from '../theme';

type Props = {
  onSignedIn: () => void;
};

export default function LoginScreen({ onSignedIn }: Props) {
  const [phone, setPhone] = useState('+91 ');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState<any>(null);
  const [sending, setSending] = useState(false);

  async function sendCode() {
    setSending(true);
    try {
      const confirmation = await auth().signInWithPhoneNumber(phone.trim());
      setConfirm(confirmation);
    } catch (err: any) {
      Alert.alert('Could not send code', err.message ?? String(err));
    } finally {
      setSending(false);
    }
  }

  async function verifyCode() {
    if (!confirm) return;
    try {
      await confirm.confirm(code);
      onSignedIn();
    } catch (err: any) {
      Alert.alert('Invalid code', err.message ?? String(err));
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.brandTitle}>NANA AI ROBOT</Text>
        <Text style={styles.brandSub}>Enterprise Sales & Remote Control Portal</Text>

        {!confirm ? (
          <>
            <Text style={styles.label}>ENTER YOUR PHONE NUMBER</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+91 98765 43210"
              placeholderTextColor={theme.colors.textMuted}
            />
            <TouchableOpacity style={styles.button} onPress={sendCode} disabled={sending}>
              <Text style={styles.buttonText}>{sending ? '⏳ Sending OTP...' : '📲 Send Verification Code'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>ENTER 6-DIGIT VERIFICATION CODE</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              placeholder="123456"
              placeholderTextColor={theme.colors.textMuted}
            />
            <TouchableOpacity style={styles.button} onPress={verifyCode}>
              <Text style={styles.buttonText}>🔒 Verify & Access Device</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
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
  brandTitle: { fontSize: 24, fontWeight: '700', color: theme.colors.text, textAlign: 'center', letterSpacing: 1 },
  brandSub: { fontSize: 12, color: theme.colors.accent, textAlign: 'center', marginBottom: 28, marginTop: 4 },
  label: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.5, marginBottom: 8 },
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
