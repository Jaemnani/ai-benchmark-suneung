import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

const BASE_URL = 'https://www.aib.vote';
const ALLOWED_HOSTS = ['www.aib.vote', 'aib.vote'];
const BLOCKED_HOSTS = ['stripe.com', 'checkout.stripe.com'];

export default function App() {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const canGoBackRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBackRef.current) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  const onShouldStart = useCallback((req: { url: string }) => {
    const url = req.url;
    try {
      const host = new URL(url).host;
      if (BLOCKED_HOSTS.some((b) => host.includes(b))) {
        return false;
      }
      if (!ALLOWED_HOSTS.includes(host) && url.startsWith('http')) {
        void Linking.openURL(url);
        return false;
      }
    } catch {
      // non-http schemes (mailto:, tel:) → open externally
      if (!url.startsWith('http')) {
        void Linking.openURL(url);
        return false;
      }
    }
    return true;
  }, []);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg?.type === 'haptic') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      // ignore
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    webRef.current?.reload();
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={{ flex: 1 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <WebView
            ref={webRef}
            source={{ uri: BASE_URL }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onNavigationStateChange={(state) => {
              canGoBackRef.current = state.canGoBack;
            }}
            onShouldStartLoadWithRequest={onShouldStart}
            onMessage={onMessage}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            allowsBackForwardNavigationGestures
            applicationNameForUserAgent="AIB-ExpoDemo/0.1"
            decelerationRate="normal"
            pullToRefreshEnabled
            startInLoadingState
          />
          {loading && (
            <View style={styles.loader} pointerEvents="none">
              <ActivityIndicator size="large" />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  loader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
});
