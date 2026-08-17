import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  sendCommand,
  watchDeviceStatus,
  watchMsgStatus,
  ExpressionValue,
} from '../services/commands';
import { theme } from '../theme';

type Props = {
  deviceId: string;
};

type ChatMessage = {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: number;
  status?: 'sending' | 'sent' | 'delivered' | 'offline' | 'failed';
  isDeviceCommand?: boolean;
};

const MAX_MSG_LENGTH = 60;

export default function ChatbotScreen({ deviceId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: `Hello! I am your Nana Bot AI Assistant 🤖. Ask me to change expressions, start games, adjust device settings, or send a custom text message to your ESP32-C3 screen!`,
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Watch device online status
    const unsubStatus = watchDeviceStatus(deviceId, (statusData) => {
      const isOnline = Boolean(statusData && (statusData.online || (statusData.lastSeen && statusData.lastSeen > 0)));
      setDeviceOnline(isOnline);
    });

    // Watch message delivery acknowledgments from ESP32-C3
    const unsubMsgStatus = watchMsgStatus(deviceId, (ackData) => {
      if (ackData && ackData.id) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === ackData.id) {
              return { ...msg, status: 'delivered' };
            }
            return msg;
          })
        );
      }
    });

    return () => {
      unsubStatus();
      unsubMsgStatus();
    };
  }, [deviceId]);

  useEffect(() => {
    // Scroll to bottom when messages update
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const handleInputChange = (text: string) => {
    setInputText(text);
    if (text.length > MAX_MSG_LENGTH) {
      setValidationError(`Message limit exceeded (${text.length}/${MAX_MSG_LENGTH} max chars)`);
    } else {
      setValidationError(null);
    }
  };

  // Natural Language Intent Parsing & Device Control Matrix
  const processNaturalLanguageCommand = async (input: string): Promise<{ handled: boolean; botReply?: string }> => {
    const lower = input.toLowerCase().trim();

    // 1. Expression Commands
    if (lower.includes('happy') || lower.includes('smile') || lower.includes('joy')) {
      await sendCommand(deviceId, { type: 'expression', value: 'happy' });
      return { handled: true, botReply: 'Executing Happy Smile expression on Nana Bot! 😊' };
    }
    if (lower.includes('cute')) {
      await sendCommand(deviceId, { type: 'expression', value: 'cute' });
      return { handled: true, botReply: 'Executing Cute expression on Nana Bot! ✨' };
    }
    if (lower.includes('angry') || lower.includes('mad')) {
      await sendCommand(deviceId, { type: 'expression', value: 'angry' });
      return { handled: true, botReply: 'Executing Angry expression on Nana Bot! 😠' };
    }
    if (lower.includes('sad') || lower.includes('cry')) {
      await sendCommand(deviceId, { type: 'expression', value: 'sad' });
      return { handled: true, botReply: 'Executing Sad expression on Nana Bot! 😢' };
    }
    if (lower.includes('wink')) {
      await sendCommand(deviceId, { type: 'expression', value: 'wink' });
      return { handled: true, botReply: 'Winking on Nana Bot! 😉' };
    }
    if (lower.includes('wave') || lower.includes('hi') || lower.includes('hello')) {
      await sendCommand(deviceId, { type: 'expression', value: 'wave' });
      return { handled: true, botReply: 'Waving hello from Nana Bot! 🖐️' };
    }
    if (lower.includes('love') || lower.includes('heart')) {
      await sendCommand(deviceId, { type: 'expression', value: 'love' });
      return { handled: true, botReply: 'Showing Love on Nana Bot! ❤️' };
    }

    // 2. Device Power States
    if (lower.includes('sleep') || lower.includes('night') || lower.includes('turn off')) {
      await sendCommand(deviceId, { type: 'sleep' });
      return { handled: true, botReply: 'Putting Nana Bot to Sleep Mode 🌙' };
    }
    if (lower.includes('wake') || lower.includes('morning') || lower.includes('turn on')) {
      await sendCommand(deviceId, { type: 'wake' });
      return { handled: true, botReply: 'Waking up Nana Bot! ☀️' };
    }

    // 3. Arcade Games
    if (lower.includes('dino') || lower.includes('runner') || lower.includes('game')) {
      await sendCommand(deviceId, { type: 'game', action: 'dino' });
      return { handled: true, botReply: 'Launching Chrome Dino Runner game on OLED display! 🦖' };
    }
    if (lower.includes('reaction') || lower.includes('test speed')) {
      await sendCommand(deviceId, { type: 'game', action: 'start' });
      return { handled: true, botReply: 'Starting Reaction Speed Test game on Nana Bot! ⚡' };
    }

    // 4. Reminders
    if (lower.includes('water') || lower.includes('drink') || lower.includes('hydrate')) {
      await sendCommand(deviceId, { type: 'reminder', value: 'water' });
      return { handled: true, botReply: 'Triggering Drink Water Hydration Alert on Nana Bot! 💧' };
    }
    if (lower.includes('food') || lower.includes('meal') || lower.includes('eat') || lower.includes('lunch') || lower.includes('dinner')) {
      await sendCommand(deviceId, { type: 'reminder', value: 'food' });
      return { handled: true, botReply: 'Triggering Meal Time Alert on Nana Bot! 🍱' };
    }

    // 5. Sound & Device Configurations
    if (lower.includes('mute') || lower.includes('silent')) {
      await sendCommand(deviceId, { type: 'settings', sndMode: 1 });
      return { handled: true, botReply: 'Set Nana Bot sound profile to Silent Mute 🔇' };
    }
    if (lower.includes('normal sound') || lower.includes('unmute')) {
      await sendCommand(deviceId, { type: 'settings', sndMode: 0 });
      return { handled: true, botReply: 'Set Nana Bot sound profile to Normal Sound 🔊' };
    }

    return { handled: false };
  };

  const sendMessage = async (rawText?: string) => {
    const textToSend = (rawText || inputText).trim();
    if (!textToSend) {
      setValidationError('Please enter a message or command.');
      return;
    }
    if (textToSend.length > MAX_MSG_LENGTH) {
      setValidationError(`Message exceeds limit (${textToSend.length}/${MAX_MSG_LENGTH} max chars)`);
      return;
    }

    setValidationError(null);
    setInputText('');

    const msgId = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userMsg: ChatMessage = {
      id: msgId,
      sender: 'user',
      text: textToSend,
      timestamp: Date.now(),
      status: deviceOnline ? 'sending' : 'offline',
    };

    setMessages((prev) => [...prev, userMsg]);

    try {
      // Step 1: Check if input matches a device control command
      const cmdResult = await processNaturalLanguageCommand(textToSend);

      if (cmdResult.handled) {
        // Command executed successfully
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, status: 'sent', isDeviceCommand: true } : m))
        );

        if (cmdResult.botReply) {
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                id: `reply_${Date.now()}`,
                sender: 'bot',
                text: cmdResult.botReply!,
                timestamp: Date.now(),
              },
            ]);
          }, 400);
        }
      } else {
        // Step 2: Custom Text Message — Transmit directly to ESP32-C3 OLED
        if (!deviceOnline) {
          setMessages((prev) =>
            prev.map((m) => (m.id === msgId ? { ...m, status: 'offline' } : m))
          );
          setMessages((prev) => [
            ...prev,
            {
              id: `reply_off_${Date.now()}`,
              sender: 'bot',
              text: `⚠️ Nana Bot (${deviceId}) is currently OFFLINE. Message will be queued for delivery when it reconnects.`,
              timestamp: Date.now(),
            },
          ]);
          return;
        }

        await sendCommand(deviceId, {
          type: 'chat_message',
          text: textToSend,
          id: msgId,
        });

        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, status: 'sent' } : m))
        );

        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              id: `reply_custom_${Date.now()}`,
              sender: 'bot',
              text: `Transmitted "${textToSend}" to ${deviceId}'s screen as an animated chat bubble! 💬✨`,
              timestamp: Date.now(),
            },
          ]);
        }, 500);
      }
    } catch (err) {
      console.warn('Error sending chat message:', err);
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, status: 'failed' } : m))
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>NANA AI CHATBOT</Text>
          <Text style={styles.headerSub}>Control & Message Device: {deviceId}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: deviceOnline ? '#10B98120' : '#EF444420' }]}>
          <View style={[styles.statusDot, { backgroundColor: deviceOnline ? '#10B981' : '#EF4444' }]} />
          <Text style={[styles.statusText, { color: deviceOnline ? '#10B981' : '#EF4444' }]}>
            {deviceOnline ? 'ONLINE' : 'OFFLINE'}
          </Text>
        </View>
      </View>

      {/* Messages Stream */}
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <View
              key={msg.id}
              style={[styles.msgWrapper, isUser ? styles.msgWrapperUser : styles.msgWrapperBot]}
            >
              <View style={[styles.msgBubble, isUser ? styles.msgBubbleUser : styles.msgBubbleBot]}>
                <Text style={[styles.msgText, isUser ? styles.msgTextUser : styles.msgTextBot]}>
                  {msg.text}
                </Text>
                {isUser && msg.status && (
                  <Text style={styles.statusLabel}>
                    {msg.status === 'sending' && 'Sending... ⏳'}
                    {msg.status === 'sent' && 'Sent ↗'}
                    {msg.status === 'delivered' && 'Delivered to Robot 🟢'}
                    {msg.status === 'offline' && 'Device Offline 🔴'}
                    {msg.status === 'failed' && 'Failed ❌'}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Quick Action Suggestion Chips */}
      <View style={styles.suggestionBox}>
        <Text style={styles.suggestionTitle}>⚡ QUICK COMMAND CHIPS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[
            { label: '😊 Happy Face', cmd: 'happy' },
            { label: '🦖 Dino Game', cmd: 'play dino game' },
            { label: '💧 Drink Water', cmd: 'drink water' },
            { label: '🍱 Meal Alert', cmd: 'meal alert' },
            { label: '🌙 Sleep Mode', cmd: 'sleep' },
            { label: '☀️ Wake Up', cmd: 'wake up' },
            { label: '🔇 Mute Sound', cmd: 'mute sound' },
          ].map((chip) => (
            <TouchableOpacity
              key={chip.label}
              style={styles.suggestionChip}
              onPress={() => sendMessage(chip.cmd)}
            >
              <Text style={styles.suggestionChipText}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Validation Error Banner */}
      {validationError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {validationError}</Text>
        </View>
      )}

      {/* Chat Input Bar */}
      <View style={styles.inputBar}>
        <View style={{ flex: 1 }}>
          <TextInput
            style={styles.textInput}
            placeholder="Type command or custom message..."
            placeholderTextColor={theme.colors.textMuted}
            value={inputText}
            onChangeText={handleInputChange}
            maxLength={MAX_MSG_LENGTH + 10} // Allow typing for validation feedback
          />
          <Text style={styles.charCounter}>
            {inputText.length} / {MAX_MSG_LENGTH}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.sendBtn, (inputText.length === 0 || inputText.length > MAX_MSG_LENGTH) && styles.sendBtnDisabled]}
          onPress={() => sendMessage()}
          disabled={inputText.length === 0 || inputText.length > MAX_MSG_LENGTH}
        >
          <Text style={styles.sendBtnText}>Send 🚀</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.cardBorder,
    backgroundColor: theme.colors.card,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  headerSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '800' },

  messageList: { padding: 16, paddingBottom: 10 },
  msgWrapper: { marginBottom: 12, maxWidth: '82%' },
  msgWrapperUser: { alignSelf: 'flex-end' },
  msgWrapperBot: { alignSelf: 'flex-start' },

  msgBubble: { borderRadius: 16, padding: 12 },
  msgBubbleUser: { backgroundColor: theme.colors.accentBg, borderWidth: 1, borderColor: theme.colors.accent },
  msgBubbleBot: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.cardBorder },

  msgText: { fontSize: 13, lineHeight: 18 },
  msgTextUser: { color: theme.colors.accent, fontWeight: '600' },
  msgTextBot: { color: theme.colors.text },

  statusLabel: { fontSize: 9, fontWeight: '700', color: theme.colors.textMuted, marginTop: 4, textAlign: 'right' },

  suggestionBox: { paddingHorizontal: 16, paddingVertical: 8 },
  suggestionTitle: { fontSize: 10, fontWeight: '800', color: theme.colors.accent, letterSpacing: 0.8, marginBottom: 6 },
  suggestionChip: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  suggestionChipText: { fontSize: 11, fontWeight: '600', color: theme.colors.text },

  errorBox: { backgroundColor: '#EF444420', padding: 8, marginHorizontal: 16, borderRadius: 8, marginBottom: 4 },
  errorText: { color: '#EF4444', fontSize: 11, fontWeight: '700', textAlign: 'center' },

  inputBar: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: theme.colors.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.cardBorder,
    gap: 10,
    alignItems: 'center',
    marginBottom: 60, // Space for bottom tab bar
  },
  textInput: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
  },
  charCounter: { fontSize: 9, color: theme.colors.textMuted, marginTop: 2, textAlign: 'right' },

  sendBtn: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#090D16', fontWeight: '800', fontSize: 12 },
});
