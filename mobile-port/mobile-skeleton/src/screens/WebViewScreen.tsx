import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '@mobile/navigation/RootStack';
import { ENV } from '@mobile/env';
import { supabase } from '@mobile/lib/supabase';
import { getInjectScript } from '@mobile/lib/native-inject';
import { shareContent } from '@mobile/lib/share';
import { haptic } from '@mobile/lib/haptics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'WebViewScreen'>;
type R = RouteProp<RootStackParamList, 'WebViewScreen'>;

const BLOCKED_DOMAINS = ['stripe.com', 'checkout.stripe.com'];

export default function WebViewScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<R>();
  const webRef = useRef<WebView>(null);
  const [injectScript, setInjectScript] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setInjectScript(getInjectScript(data.session));
    })();
  }, []);

  function onShouldStartLoad(request: { url: string }): boolean {
    const url = request.url;
    if (BLOCKED_DOMAINS.some((d) => url.includes(d))) {
      Alert.alert(
        '결제 안내',
        '모바일에서는 앱 내 구매를 통해서만 결제할 수 있습니다.',
      );
      return false;
    }
    // 외부 도메인은 RN의 SafariViewController/Custom Tab으로 열기
    if (
      !url.startsWith(ENV.WEBVIEW_BASE_URL) &&
      !url.startsWith('https://aib.vote') &&
      url.startsWith('http')
    ) {
      // (옵션) react-native-inappbrowser-reborn 사용. v1.0은 단순 차단.
      return false;
    }
    return true;
  }

  function onMessage(event: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as {
        type: string;
        [k: string]: unknown;
      };
      switch (msg.type) {
        case 'share':
          haptic.light();
          void shareContent({
            title: typeof msg.title === 'string' ? msg.title : undefined,
            message: String(msg.message ?? ''),
            url: typeof msg.url === 'string' ? msg.url : undefined,
          });
          break;
        case 'haptic':
          haptic.light();
          break;
        case 'navigate-home':
          navigation.navigate('Main');
          break;
        default:
          break;
      }
    } catch {
      // ignore malformed messages
    }
  }

  if (!injectScript) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <WebView
        ref={webRef}
        source={{ uri: `${ENV.WEBVIEW_BASE_URL}${params.path}` }}
        injectedJavaScriptBeforeContentLoaded={injectScript}
        onShouldStartLoadWithRequest={onShouldStartLoad}
        onMessage={onMessage}
        startInLoadingState
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        applicationNameForUserAgent="AIB-Native/1.0"
        renderLoading={() => (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
