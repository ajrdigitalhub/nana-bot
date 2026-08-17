import React, { useEffect, useState } from 'react';
import { SafeAreaView, ActivityIndicator } from 'react-native';
import auth from '@react-native-firebase/auth';

import LoginScreen from './src/screens/LoginScreen';
import PairingScreen, { getSavedDeviceId, clearSavedDeviceId } from './src/screens/PairingScreen';
import HomeScreen from './src/screens/HomeScreen';
import NavigateScreen from './src/screens/NavigateScreen';
import GamesScreen from './src/screens/GamesScreen';
import DoodleScreen from './src/screens/DoodleScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import BottomTabBar, { Tab } from './src/components/BottomTabBar';
import { checkDeviceExists } from './src/services/commands';
import { theme } from './src/theme';

type Screen = 'loading' | 'login' | 'pairing' | 'paired';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [doodleOpen, setDoodleOpen] = useState(false);

  const handleUnpair = async () => {
    await clearSavedDeviceId();
    setDeviceId(null);
    setScreen('pairing');
  };

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(async (user) => {
      if (!user) {
        setScreen('login');
        return;
      }
      const saved = await getSavedDeviceId();
      if (saved) {
        // Live startup verification check: Ensure device exists & is online in Firebase
        const status = await checkDeviceExists(saved);
        if (status.exists && status.online) {
          setDeviceId(saved);
          setScreen('paired');
        } else {
          // Device is offline or un-registered — clear stored ID and force pairing screen
          await clearSavedDeviceId();
          setScreen('pairing');
        }
      } else {
        setScreen('pairing');
      }
    });
    return unsubscribe;
  }, []);

  if (screen === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.colors.bg }}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </SafeAreaView>
    );
  }

  if (screen === 'login') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <LoginScreen onSignedIn={() => setScreen('pairing')} />
      </SafeAreaView>
    );
  }

  if (screen === 'pairing') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <PairingScreen
          onPaired={(id) => {
            setDeviceId(id);
            setScreen('paired');
          }}
        />
      </SafeAreaView>
    );
  }

  // screen === 'paired'
  if (!deviceId) return null;

  if (doodleOpen) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <DoodleScreen deviceId={deviceId} onDone={() => setDoodleOpen(false)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {activeTab === 'home' && (
        <HomeScreen 
          deviceId={deviceId} 
          onOpenDoodle={() => setDoodleOpen(true)} 
          onUnpair={handleUnpair}
        />
      )}
      {activeTab === 'navigate' && <NavigateScreen deviceId={deviceId} />}
      {activeTab === 'games' && <GamesScreen deviceId={deviceId} />}
      {activeTab === 'settings' && (
        <SettingsScreen deviceId={deviceId} onUnpair={handleUnpair} />
      )}
      <BottomTabBar active={activeTab} onChange={setActiveTab} />
    </SafeAreaView>
  );
}
