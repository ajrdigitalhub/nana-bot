import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

export type Tab = 'home' | 'chatbot' | 'navigate' | 'games' | 'settings';

type Props = {
  active: Tab;
  onChange: (tab: Tab) => void;
};

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'home', label: 'Home', icon: '🏠' },
  { key: 'chatbot', label: 'Chatbot', icon: '💬' },
  { key: 'navigate', label: 'Navigate', icon: '🗺️' },
  { key: 'games', label: 'Arcade', icon: '🎮' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function BottomTabBar({ active, onChange }: Props) {
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <TouchableOpacity 
            key={tab.key} 
            style={[styles.tab, isActive && styles.tabActive]} 
            onPress={() => onChange(tab.key)}
          >
            <Text style={styles.icon}>{tab.icon}</Text>
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.colors.cardBorder,
    backgroundColor: theme.colors.card,
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 12,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: theme.controlRadius },
  tabActive: { backgroundColor: theme.colors.accentBg },
  icon: { fontSize: 16, marginBottom: 2 },
  label: { fontSize: 11, fontWeight: '500', color: theme.colors.textMuted },
  labelActive: { color: theme.colors.accent, fontWeight: '700' },
});
