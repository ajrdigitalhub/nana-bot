import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendCommand, watchGameResult } from '../services/commands';
import { theme } from '../theme';

type Props = {
  deviceId: string;
};

const BEST_SCORE_KEY_PREFIX = 'chotubot:bestReactionMs:';

export default function GamesScreen({ deviceId }: Props) {
  const [lastResult, setLastResult] = useState<{ reactionMs: number; tooSoon: boolean; playedAt: number } | null>(null);
  const [bestMs, setBestMs] = useState<number | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(BEST_SCORE_KEY_PREFIX + deviceId).then((v) => {
      if (v) setBestMs(parseInt(v, 10));
    });
    const unsubscribe = watchGameResult(deviceId, (result) => {
      setLastResult(result);
      if (result && !result.tooSoon && result.reactionMs > 0) {
        setBestMs((prevBest) => {
          const isNewBest = prevBest === null || result.reactionMs < prevBest;
          if (isNewBest) {
            AsyncStorage.setItem(BEST_SCORE_KEY_PREFIX + deviceId, String(result.reactionMs));
            return result.reactionMs;
          }
          return prevBest;
        });
      }
    });
    return unsubscribe;
  }, [deviceId]);

  function playReactionGame() {
    sendCommand(deviceId, { type: 'game', action: 'start' });
  }

  function playDinoGame() {
    sendCommand(deviceId, { type: 'game', action: 'dino' });
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>NANA ARCADE GAMES</Text>
      <Text style={styles.hint}>
        Launch interactive games on NANA's OLED screen and track performance results in real-time.
      </Text>

      {/* Chrome Dino Runner Launcher Card */}
      <View style={[styles.gameCard, { borderColor: theme.colors.amber }]}>
        <View style={styles.gameHeader}>
          <Text style={styles.gameIcon}>🦖</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.gameTitle}>Chrome Dino Runner</Text>
            <Text style={styles.gameSub}>Obstacle runner game with score tracking</Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.playBtn, { backgroundColor: theme.colors.amber, borderColor: theme.colors.amber }]} onPress={playDinoGame}>
          <Text style={styles.playBtnText}>START DINO RUNNER</Text>
        </TouchableOpacity>
      </View>

      {/* Reaction Time Test Launcher Card */}
      <View style={[styles.gameCard, { borderColor: theme.colors.accent }]}>
        <View style={styles.gameHeader}>
          <Text style={styles.gameIcon}>⚡</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.gameTitle}>Reaction Speed Test</Text>
            <Text style={styles.gameSub}>Tap NANA's touch sensor as fast as possible on GO!</Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.playBtn, { backgroundColor: theme.colors.accentBg, borderColor: theme.colors.accent }]} onPress={playReactionGame}>
          <Text style={[styles.playBtnText, { color: theme.colors.accent }]}>START REACTION TEST</Text>
        </TouchableOpacity>
      </View>

      {/* Stats & Scoreboard */}
      <Text style={styles.sectionTitle}>REACTION SCOREBOARD</Text>
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>LAST REACTION</Text>
          <Text style={styles.statValue}>
            {lastResult == null
              ? '—'
              : lastResult.tooSoon
              ? 'Too soon!'
              : `${lastResult.reactionMs} ms`}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>PERSONAL BEST</Text>
          <Text style={[styles.statValue, { color: theme.colors.success }]}>
            {bestMs == null ? '—' : `${bestMs} ms`}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: theme.colors.bg, flexGrow: 1 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text, letterSpacing: 0.5, marginBottom: 4 },
  hint: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 20, lineHeight: 18 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: theme.colors.accent, letterSpacing: 1, marginTop: 10, marginBottom: 12 },
  
  gameCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  gameHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  gameIcon: { fontSize: 28 },
  gameTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  gameSub: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  
  playBtn: {
    paddingVertical: 12,
    borderRadius: theme.controlRadius,
    borderWidth: 1,
    alignItems: 'center',
  },
  playBtnText: { fontSize: 12, fontWeight: '700', color: '#000000', letterSpacing: 0.5 },

  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.card,
    padding: 16,
    alignItems: 'center',
  },
  statLabel: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.5, marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
});
