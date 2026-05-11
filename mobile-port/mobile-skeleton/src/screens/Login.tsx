import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '@mobile/navigation/RootStack';
import { signInWithApple, signInWithGoogle } from '@mobile/lib/auth';
import { initIAP } from '@mobile/lib/iap';
import { registerPushToken } from '@mobile/lib/push';
import { haptic } from '@mobile/lib/haptics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Login'>;

export default function Login() {
  const navigation = useNavigation<Nav>();
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);

  async function handleSignIn(provider: 'apple' | 'google') {
    setBusy(provider);
    try {
      const session =
        provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
      haptic.success();
      await initIAP(session.user.id);
      void registerPushToken();
      navigation.replace('Main');
    } catch (err) {
      haptic.error();
      const message = err instanceof Error ? err.message : '로그인에 실패했습니다';
      Alert.alert('로그인 실패', message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>aib</Text>
      <Text style={styles.subtitle}>AI 기반 학습 · 뉴스 · 토론</Text>

      <View style={styles.buttons}>
        {Platform.OS === 'ios' && (
          <Pressable
            style={[styles.btn, styles.btnApple]}
            onPress={() => handleSignIn('apple')}
            disabled={busy !== null}
          >
            {busy === 'apple' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnAppleText}>  Apple로 계속하기</Text>
            )}
          </Pressable>
        )}

        <Pressable
          style={[styles.btn, styles.btnGoogle]}
          onPress={() => handleSignIn('google')}
          disabled={busy !== null}
        >
          {busy === 'google' ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.btnGoogleText}>Google로 계속하기</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.legal}>
        로그인하면 이용약관 및 개인정보 처리방침에 동의하는 것으로 간주됩니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  title: { fontSize: 56, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 48 },
  buttons: { width: '100%', gap: 12 },
  btn: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnApple: { backgroundColor: '#000' },
  btnAppleText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  btnGoogle: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  btnGoogleText: { color: '#222', fontWeight: '600', fontSize: 16 },
  legal: { marginTop: 32, fontSize: 12, color: '#999', textAlign: 'center' },
});
