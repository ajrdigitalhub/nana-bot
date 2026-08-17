import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Dimensions, Platform, StatusBar, Image } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { theme } from '../theme';

const { width } = Dimensions.get('window');
const nanaBotImg = require('../../android/app/src/main/assets/nana-bot.png');

type Props = {
  onFinish: () => void;
};

const AnimatedPath = Animated.createAnimatedComponent(Path);

export default function IntroSplashScreen({ onFinish }: Props) {
  const drawAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.75)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const brandingFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Sequential Animation: 1. Scale & Draw NANA Cursive text -> 2. Glow -> 3. Fade in AJR Branding
    Animated.sequence([
      Animated.parallel([
        Animated.timing(drawAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 5,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(brandingFadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowAnim, { toValue: 0.9, duration: 800, useNativeDriver: true }),
            Animated.timing(glowAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
          ]),
          { iterations: 2 }
        ),
      ]),
    ]).start(() => {
      setTimeout(onFinish, 400);
    });
  }, []);

  const strokeDashoffset = drawAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Skip Button */}
      <TouchableOpacity style={styles.skipButton} onPress={onFinish} activeOpacity={0.7}>
        <Text style={styles.skipText}>Skip ➔</Text>
      </TouchableOpacity>

      {/* Center NANA-BOT Image + Cursive Handwriting Drawing Animation */}
      <Animated.View
        style={[
          styles.centerBox,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Neon Dual-Glow Halo Behind Logo */}
        <Animated.View style={[styles.glowHalo, { opacity: glowAnim }]} />

        {/* Hero 3D NANA-BOT Logo Image */}
        <Image source={nanaBotImg} style={styles.botImage} resizeMode="contain" />

        {/* Animated Cursive Handwriting Stroke Overlay */}
        <View style={styles.svgOverlay}>
          <Svg height="90" width="260" viewBox="0 0 300 120">
            {/* Cursive N Letter */}
            <AnimatedPath
              d="M 25 90 C 20 60, 30 25, 45 20 C 50 18, 55 25, 50 45 C 45 65, 80 95, 90 30 C 92 20, 95 25, 92 40"
              stroke="#00E5FF"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray="600"
              strokeDashoffset={strokeDashoffset}
            />
            {/* Cursive A Letter */}
            <AnimatedPath
              d="M 95 65 C 90 50, 115 45, 120 65 C 125 85, 95 85, 100 65 C 105 45, 125 45, 130 85"
              stroke="#E040FB"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray="600"
              strokeDashoffset={strokeDashoffset}
            />
            {/* Cursive N Letter */}
            <AnimatedPath
              d="M 135 85 C 130 60, 140 45, 150 40 C 155 38, 160 45, 155 60 C 150 75, 180 90, 190 40 C 192 35, 195 40, 192 55"
              stroke="#00E5FF"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray="600"
              strokeDashoffset={strokeDashoffset}
            />
            {/* Cursive A Letter with flourish */}
            <AnimatedPath
              d="M 195 65 C 190 50, 215 45, 220 65 C 225 85, 195 85, 200 65 C 205 45, 230 45, 235 85 C 240 90, 260 75, 275 60"
              stroke="#E040FB"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray="600"
              strokeDashoffset={strokeDashoffset}
            />
          </Svg>
        </View>

        <Text style={styles.tagline}>AI DESKTOP COMPANION</Text>
      </Animated.View>

      {/* Bottom Branding Section */}
      <Animated.View style={[styles.bottomBranding, { opacity: brandingFadeAnim }]}>
        <View style={styles.brandingCard}>
          <Text style={styles.productTitle}>AJR Mart Product</Text>
          <Text style={styles.poweredBy}>Powered by AJR Groups</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const STATUSBAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: STATUSBAR_HEIGHT,
  },
  skipButton: {
    position: 'absolute',
    top: STATUSBAR_HEIGHT + 14,
    right: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    zIndex: 10,
  },
  skipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glowHalo: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#00E5FF20',
    shadowColor: '#E040FB',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 20,
  },
  botImage: {
    width: 240,
    height: 240,
  },
  svgOverlay: {
    position: 'absolute',
    bottom: 34,
    alignItems: 'center',
  },
  tagline: {
    fontSize: 12,
    fontWeight: '800',
    color: '#00E5FF',
    letterSpacing: 3,
    marginTop: -8,
    textAlign: 'center',
  },
  bottomBranding: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
    width: '100%',
  },
  brandingCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.8,
  },
  poweredBy: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
});
