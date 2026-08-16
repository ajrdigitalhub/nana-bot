import React, { useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, PanResponder } from 'react-native';
import Canvas, { CanvasRenderingContext2D } from 'react-native-canvas';
import { sendCommand } from '../services/commands';
import { rgbaToPackedBitmap, bitmapToBase64 } from '../services/bitmapEncoder';
import { theme } from '../theme';

type Props = {
  deviceId: string;
  onDone: () => void;
};

const DOODLE_WIDTH = 128;
const DOODLE_HEIGHT = 64;
const DISPLAY_SCALE = 2.8;

export default function DoodleScreen({ deviceId, onDone }: Props) {
  const canvasRef = useRef<Canvas>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [sending, setSending] = useState(false);

  async function handleCanvas(canvas: Canvas) {
    if (!canvas) return;
    canvas.width = DOODLE_WIDTH * DISPLAY_SCALE;
    canvas.height = DOODLE_HEIGHT * DISPLAY_SCALE;
    const ctx = await canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctxRef.current = ctx;
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        lastPoint.current = { x: locationX, y: locationY };
      },
      onPanResponderMove: (evt) => {
        const ctx = ctxRef.current;
        const prev = lastPoint.current;
        if (!ctx || !prev) return;
        const { locationX, locationY } = evt.nativeEvent;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(locationX, locationY);
        ctx.stroke();
        lastPoint.current = { x: locationX, y: locationY };
      },
      onPanResponderRelease: () => {
        lastPoint.current = null;
      },
    })
  ).current;

  async function clear() {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  async function sendDoodle() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    setSending(true);
    try {
      const fullImageData = await ctx.getImageData(
        0,
        0,
        DOODLE_WIDTH * DISPLAY_SCALE,
        DOODLE_HEIGHT * DISPLAY_SCALE
      );
      const downsampled = new Uint8ClampedArray(DOODLE_WIDTH * DOODLE_HEIGHT * 4);
      for (let y = 0; y < DOODLE_HEIGHT; y++) {
        for (let x = 0; x < DOODLE_WIDTH; x++) {
          const srcX = Math.floor(x * DISPLAY_SCALE);
          const srcY = Math.floor(y * DISPLAY_SCALE);
          const srcI = (srcY * Math.floor(DOODLE_WIDTH * DISPLAY_SCALE) + srcX) * 4;
          const dstI = (y * DOODLE_WIDTH + x) * 4;
          downsampled[dstI] = fullImageData.data[srcI];
          downsampled[dstI + 1] = fullImageData.data[srcI + 1];
          downsampled[dstI + 2] = fullImageData.data[srcI + 2];
          downsampled[dstI + 3] = fullImageData.data[srcI + 3];
        }
      }

      const packed = rgbaToPackedBitmap(downsampled, DOODLE_WIDTH, DOODLE_HEIGHT);
      const base64 = bitmapToBase64(packed);

      await sendCommand(deviceId, {
        type: 'doodle',
        bitmapBase64: base64,
        w: DOODLE_WIDTH,
        h: DOODLE_HEIGHT,
        durationMs: 10000,
      });
      onDone();
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>✏️ DOODLE CANVAS</Text>
      <Text style={styles.sub}>Draw anything below to send a live 128x64 bitmap directly to NANA's screen.</Text>
      
      <View
        style={styles.canvasContainer}
        {...panResponder.panHandlers}
      >
        <Canvas ref={canvasRef} style={styles.canvas} onLayout={() => canvasRef.current && handleCanvas(canvasRef.current)} />
      </View>

      <View style={styles.row}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.colors.card, borderColor: theme.colors.cardBorder }]} onPress={clear}>
          <Text style={styles.btnText}>🗑️ Clear</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.btn, { backgroundColor: theme.colors.accentBg, borderColor: theme.colors.accent }]} 
          onPress={sendDoodle} 
          disabled={sending}
        >
          <Text style={[styles.btnText, { color: theme.colors.accent }]}>{sending ? '⏳ Transmitting...' : '🚀 Transmit to NANA'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.colors.card, borderColor: theme.colors.cardBorder }]} onPress={onDone}>
          <Text style={styles.btnText}>❌ Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', padding: 20, backgroundColor: theme.colors.bg },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text, letterSpacing: 0.5, marginBottom: 4 },
  sub: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 20, textAlign: 'center', lineHeight: 18 },
  canvasContainer: {
    borderRadius: theme.radius,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: theme.colors.accent,
    backgroundColor: '#FFFFFF',
    elevation: 6,
  },
  canvas: { width: DOODLE_WIDTH * DISPLAY_SCALE, height: DOODLE_HEIGHT * DISPLAY_SCALE },
  row: { flexDirection: 'row', marginTop: 24, gap: 10, width: '100%' },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: theme.controlRadius,
    borderWidth: 1,
    alignItems: 'center',
  },
  btnText: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
});
