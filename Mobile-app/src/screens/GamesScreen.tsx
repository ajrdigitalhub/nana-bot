import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendCommand, watchGameResult } from '../services/commands';
import { theme } from '../theme';

type Props = {
  deviceId: string;
};

const BEST_SCORE_KEY_PREFIX = 'chotubot:bestReactionMs:';
const STATUSBAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 12 : 12;

export default function GamesScreen({ deviceId }: Props) {
  const [lastResult, setLastResult] = useState<{ reactionMs: number; tooSoon: boolean; playedAt: number } | null>(null);
  const [bestMs, setBestMs] = useState<number | null>(null);
  const [activeGame, setActiveGame] = useState<'dino' | 'reaction' | null>(null);

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
    setActiveGame('reaction');
    sendCommand(deviceId, { type: 'game', action: 'start' });
  }

  function playDinoGame() {
    setActiveGame('dino');
    sendCommand(deviceId, { type: 'game', action: 'dino' });
  }

  function sendJumpAction() {
    sendCommand(deviceId, { type: 'game', action: 'jump' });
  }

  function quitActiveGame() {
    setActiveGame(null);
    sendCommand(deviceId, { type: 'game', action: 'quit' });
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: STATUSBAR_HEIGHT }]}>
      <Text style={styles.title}>NANA ARCADE GAMES</Text>
      <Text style={styles.hint}>
        Sync your phone controller to play games on NANA's OLED screen in real-time.
      </Text>

      {/* ACTIVE GAME CONTROLLER HUD */}
      {activeGame && (
        <View style={styles.controllerCard}>
          <View style={styles.syncHeader}>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>SYNCED TO FIRMWARE DISPLAY</Text>
            </View>
            <TouchableOpacity style={styles.quitBadgeBtn} onPress={quitActiveGame}>
              <Text style={styles.quitBadgeText}>🛑 QUIT GAME</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.activeGameTitle}>
            {activeGame === 'dino' ? '🦖 Chrome Dino Runner' : '⚡ Reaction Speed Test'}
          </Text>
          <Text style={styles.controllerInstruction}>
            {activeGame === 'dino'
              ? 'Tap the Action Button below to jump the elephant on NANA\'s screen!'
              : 'Tap REACT NOW as soon as NANA shows GO! on display!'}
          </Text>

          {/* MAIN ACTION / JUMP BUTTON */}
          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: activeGame === 'dino' ? theme.colors.amber : theme.colors.accentBg }
            ]}
            onPress={sendJumpAction}
            activeOpacity={0.7}
          >
            <Text style={[styles.actionButtonText, activeGame === 'dino' ? { color: '#000000' } : { color: theme.colors.accent }]}>
              {activeGame === 'dino' ? '🦘 JUMP ELEPHANT 🚀' : '⚡ REACT NOW / TAP'}
            </Text>
          </TouchableOpacity>

          {/* CONTROLLER BOTTOM TOOLBAR */}
          <View style={styles.controllerToolbar}>
            <TouchableOpacity
              style={styles.toolBtn}
              onPress={activeGame === 'dino' ? playDinoGame : playReactionGame}
            >
              <Text style={styles.toolBtnText}>🔄 Restart</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolBtn, styles.toolBtnQuit]}
              onPress={quitActiveGame}
            >
              <Text style={[styles.toolBtnText, { color: theme.colors.danger }]}>🛑 Quit Game</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Chrome Dino Runner Launcher Card */}
      <View style={[styles.gameCard, { borderColor: theme.colors.amber }]}>
        <View style={styles.gameHeader}>
          <Text style={styles.gameIcon}>🦖</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.gameTitle}>Chrome Dino Runner</Text>
            <Text style={styles.gameSub}>Obstacle runner game with live phone controller sync</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.playBtn, { backgroundColor: theme.colors.amber, borderColor: theme.colors.amber }]}
          onPress={playDinoGame}
        >
          <Text style={styles.playBtnText}>
            {activeGame === 'dino' ? '🎮 PLAYING (TAP TO RESTART)' : 'PLAY FROM PHONE'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Reaction Time Test Launcher Card */}
      <View style={[styles.gameCard, { borderColor: theme.colors.accent }]}>
        <View style={styles.gameHeader}>
          <Text style={styles.gameIcon}>⚡</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.gameTitle}>Reaction Speed Test</Text>
            <Text style={styles.gameSub}>Test reaction speed from phone or touch sensor</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.playBtn, { backgroundColor: theme.colors.accentBg, borderColor: theme.colors.accent }]}
          onPress={playReactionGame}
        >
          <Text style={[styles.playBtnText, { color: theme.colors.accent }]}>
            {activeGame === 'reaction' ? '🎮 PLAYING (TAP TO RESTART)' : 'START REACTION TEST'}
          </Text>
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

  controllerCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius,
    borderWidth: 2,
    borderColor: theme.colors.accent,
    padding: 16,
    marginBottom: 20,
    boxShadow: '0px 0px 15px rgba(56, 189, 248, 0.2)',
  },
  syncHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.success },
  liveText: { fontSize: 10, fontWeight: '800', color: theme.colors.success, letterSpacing: 0.5 },
  quitBadgeBtn: { backgroundColor: theme.colors.dangerBg, borderColor: theme.colors.danger, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  quitBadgeText: { fontSize: 10, fontWeight: '800', color: theme.colors.danger },

  activeGameTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
  controllerInstruction: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 14 },

  actionButton: {
    paddingVertical: 18,
    borderRadius: theme.radius,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  actionButtonText: { fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },

  controllerToolbar: { flexDirection: 'row', gap: 10 },
  toolBtn: { flex: 1, paddingVertical: 10, borderRadius: theme.controlRadius, backgroundColor: theme.colors.cardHover, borderWidth: 1, borderColor: theme.colors.cardBorder, alignItems: 'center' },
  toolBtnQuit: { backgroundColor: theme.colors.dangerBg, borderColor: theme.colors.danger },
  toolBtnText: { fontSize: 12, fontWeight: '700', color: theme.colors.text },

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
