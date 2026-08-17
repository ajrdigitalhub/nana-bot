import React, { useEffect, useState } from 'react';
import { View, StatusBar } from 'react-native';
import auth from '@react-native-firebase/auth';

import IntroSplashScreen from './src/components/IntroSplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import PairingScreen, { getSavedDeviceId, clearSavedDeviceId } from './src/screens/PairingScreen';
import HomeScreen from './src/screens/HomeScreen';
import RemindersScreen from './src/screens/RemindersScreen';
import NavigateScreen from './src/screens/NavigateScreen';
import GamesScreen from './src/screens/GamesScreen';
import DoodleScreen from './src/screens/DoodleScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ChatbotScreen from './src/screens/ChatbotScreen';
import BottomTabBar, { Tab } from './src/components/BottomTabBar';
import { checkDeviceExists } from './src/services/commands';
import { theme } from './src/theme';

type Screen = 'loading' | 'login' | 'pairing' | 'paired';

export default function App() {
  const [showIntro, setShowIntro] = useState(true);
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
        const status = await checkDeviceExists(saved);
        if (status.exists && status.online) {
          setDeviceId(saved);
          setScreen('paired');
        } else {
          await clearSavedDeviceId();
          setScreen('pairing');
        }
      } else {
        setScreen('pairing');
      }
    });
    return unsubscribe;
  }, []);

  if (showIntro) {
    return <IntroSplashScreen onFinish={() => setShowIntro(false)} />;
  }

  if (screen === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <IntroSplashScreen onFinish={() => setScreen('pairing')} />
      </View>
    );
  }

  if (screen === 'login') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <LoginScreen onSignedIn={() => setScreen('pairing')} />
      </View>
    );
  }

  if (screen === 'pairing') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <PairingScreen
          onPaired={(id) => {
            setDeviceId(id);
            setScreen('paired');
          }}
        />
      </View>
    );
  }

  // screen === 'paired'
  if (!deviceId) return null;

  if (doodleOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <DoodleScreen deviceId={deviceId} onDone={() => setDoodleOpen(false)} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      {activeTab === 'home' && (
        <HomeScreen 
          deviceId={deviceId} 
          onOpenDoodle={() => setDoodleOpen(true)} 
          onUnpair={handleUnpair}
        />
      )}
      {activeTab === 'chatbot' && <ChatbotScreen deviceId={deviceId} />}
      {activeTab === 'reminders' && <RemindersScreen deviceId={deviceId} />}
      {activeTab === 'navigate' && <NavigateScreen deviceId={deviceId} />}
      {activeTab === 'games' && <GamesScreen deviceId={deviceId} />}
      {activeTab === 'settings' && (
        <SettingsScreen deviceId={deviceId} onUnpair={handleUnpair} />
      )}
      <BottomTabBar active={activeTab} onChange={setActiveTab} />
    </View>
  );
}
