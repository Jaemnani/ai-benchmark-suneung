import React, { useEffect, useRef, useState } from 'react';
import { StatusBar, View, ActivityIndicator } from 'react-native';
import { NavigationContainer, type NavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootStack, type RootStackParamList } from '@mobile/navigation/RootStack';
import { restoreSessionWithBiometrics } from '@mobile/lib/auth';
import { supabase } from '@mobile/lib/supabase';
import { initIAP } from '@mobile/lib/iap';
import { registerPushToken, attachForegroundHandler } from '@mobile/lib/push';
import { attachLinkingListener } from '@mobile/lib/deeplink';

export default function App() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  useEffect(() => {
    (async () => {
      const restored = await restoreSessionWithBiometrics();
      if (restored) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          await initIAP(data.session.user.id);
          void registerPushToken();
          setInitialRoute('Main');
          return;
        }
      }
      setInitialRoute('Login');
    })();
  }, []);

  useEffect(() => {
    const unsub = attachForegroundHandler();
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!navRef.current) return;
    const detach = attachLinkingListener(navRef.current);
    return () => detach();
  }, [initialRoute]);

  if (!initialRoute) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <NavigationContainer ref={navRef}>
        <RootStack initialRoute={initialRoute} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
