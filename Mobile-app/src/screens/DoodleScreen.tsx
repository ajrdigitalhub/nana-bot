import React, { useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  PanResponder,
  Dimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { sendCommand } from '../services/commands';
import { bitmapToBase64 } from '../services/bitmapEncoder';
import { theme } from '../theme';

type Props = {
  deviceId: string;
  onDone: () => void;
};

type Point = { x: number; y: number };
type Stroke = Point[];

const DOODLE_WIDTH = 128;
const DOODLE_HEIGHT = 64;
const SCREEN_PADDING = 32;
const CANVAS_WIDTH = Math.min(Dimensions.get('window').width - SCREEN_PADDING, 360);
const CANVAS_HEIGHT = Math.round(CANVAS_WIDTH * (DOODLE_HEIGHT / DOODLE_WIDTH));

export default function DoodleScreen({ deviceId, onDone }: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const currentStroke = useRef<Point[]>([]);
  const [sending, setSending] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        currentStroke.current = [{ x: locationX, y: locationY }];
        setStrokes((prev) => [...prev, currentStroke.current]);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        currentStroke.current.push({ x: locationX, y: locationY });
        // Trigger re-render of active stroke
        setStrokes((prev) => [...prev.slice(0, prev.length - 1), [...currentStroke.current]]);
      },
      onPanResponderRelease: () => {
        currentStroke.current = [];
      },
    })
  ).current;

  const clear = () => {
    setStrokes([]);
    currentStroke.current = [];
  };

  const pointsToSvgPath = (points: Point[]) => {
    if (points.length === 0) return '';
    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y + 0.1}`;
    }
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  };

  const sendDoodle = async () => {
    if (strokes.length === 0) return;
    setSending(true);

    try {
      // Rasterize strokes to 128x64 grid
      const grid = new Uint8Array(DOODLE_WIDTH * DOODLE_HEIGHT);

      const drawLine = (x0: number, y0: number, x1: number, y1: number) => {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        let cx = x0;
        let cy = y0;

        while (true) {
          // Draw a 2x2 stroke spot for clear OLED visibility
          for (let rx = -1; rx <= 1; rx++) {
            for (let ry = -1; ry <= 1; ry++) {
              const px = cx + rx;
              const py = cy + ry;
              if (px >= 0 && px < DOODLE_WIDTH && py >= 0 && py < DOODLE_HEIGHT) {
                grid[py * DOODLE_WIDTH + px] = 1;
              }
            }
          }

          if (cx === x1 && cy === y1) break;
          const e2 = 2 * err;
          if (e2 > -dy) {
            err -= dy;
            cx += sx;
          }
          if (e2 < dx) {
            err += dx;
            cy += sy;
          }
        }
      };

      for (const stroke of strokes) {
        if (stroke.length === 0) continue;
        for (let i = 0; i < stroke.length - 1; i++) {
          const p1 = stroke[i];
          const p2 = stroke[i + 1];

          const gx1 = Math.floor((p1.x / CANVAS_WIDTH) * DOODLE_WIDTH);
          const gy1 = Math.floor((p1.y / CANVAS_HEIGHT) * DOODLE_HEIGHT);
          const gx2 = Math.floor((p2.x / CANVAS_WIDTH) * DOODLE_WIDTH);
          const gy2 = Math.floor((p2.y / CANVAS_HEIGHT) * DOODLE_HEIGHT);

          drawLine(gx1, gy1, gx2, gy2);
        }
        if (stroke.length === 1) {
          const gx = Math.floor((stroke[0].x / CANVAS_WIDTH) * DOODLE_WIDTH);
          const gy = Math.floor((stroke[0].y / CANVAS_HEIGHT) * DOODLE_HEIGHT);
          drawLine(gx, gy, gx, gy);
        }
      }

      // Convert 128x64 grid to 1024 packed bits (1bpp)
      const packed = new Uint8Array(Math.ceil((DOODLE_WIDTH * DOODLE_HEIGHT) / 8));
      let bitIdx = 0;

      for (let y = 0; y < DOODLE_HEIGHT; y++) {
        for (let x = 0; x < DOODLE_WIDTH; x++) {
          const isBlack = grid[y * DOODLE_WIDTH + x] === 1 ? 1 : 0;
          if (isBlack) {
            const byteIdx = Math.floor(bitIdx / 8);
            const bitOffset = 7 - (bitIdx % 8);
            packed[byteIdx] |= 1 << bitOffset;
          }
          bitIdx++;
        }
      }

      const base64 = bitmapToBase64(packed);

      await sendCommand(deviceId, {
        type: 'doodle',
        bitmapBase64: base64,
        w: DOODLE_WIDTH,
        h: DOODLE_HEIGHT,
        durationMs: 10000,
      });

      onDone();
    } catch (err) {
      console.warn('Error transmitting doodle:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DRAW CUSTOM DOODLE</Text>
      <Text style={styles.subtitle}>
        Draw anything below. It will display live on {deviceId}'s OLED screen!
      </Text>

      <View
        style={[styles.canvasWrapper, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }]}
        {...panResponder.panHandlers}
      >
        <Svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
          {strokes.map((stroke, i) => (
            <Path
              key={i}
              d={pointsToSvgPath(stroke)}
              stroke="#000000"
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.btnSecondary} onPress={clear} disabled={sending}>
          <Text style={styles.btnSecondaryText}>Clear</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnSecondary} onPress={onDone} disabled={sending}>
          <Text style={styles.btnSecondaryText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnPrimary, sending && styles.disabled]}
          onPress={sendDoodle}
          disabled={sending || strokes.length === 0}
        >
          <Text style={styles.btnPrimaryText}>{sending ? 'Sending...' : 'Send to Robot ✨'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
  },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
  subtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  canvasWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.accent,
    overflow: 'hidden',
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  controls: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
    width: '100%',
    maxWidth: 360,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  btnSecondaryText: { color: theme.colors.text, fontWeight: '600', fontSize: 13 },
  btnPrimary: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#090D16', fontWeight: '800', fontSize: 13 },
  disabled: { opacity: 0.5 },
});
