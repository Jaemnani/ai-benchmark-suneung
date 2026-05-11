import { Platform, PermissionsAndroid } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';

import { ENV } from '@mobile/env';
import { supabase } from '@mobile/lib/supabase';

const CHANNEL_ID = 'default';

export async function ensurePushChannel() {
  if (Platform.OS === 'android') {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: '기본 알림',
      importance: AndroidImportance.HIGH,
      sound: 'default',
    });
  }
}

export async function requestPushPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    const auth = await messaging().requestPermission({
      alert: true,
      badge: true,
      sound: true,
    });
    return (
      auth === messaging.AuthorizationStatus.AUTHORIZED ||
      auth === messaging.AuthorizationStatus.PROVISIONAL
    );
  }
  if (Platform.Version >= 33) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
}

export async function registerPushToken(): Promise<string | null> {
  const granted = await requestPushPermission();
  if (!granted) return null;
  await ensurePushChannel();

  const token = await messaging().getToken();
  if (!token) return null;

  await syncTokenToServer(token);

  messaging().onTokenRefresh((newToken) => {
    void syncTokenToServer(newToken);
  });

  return token;
}

async function syncTokenToServer(token: string) {
  const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return; // 로그인 전이면 skip — 로그인 후 다시 호출
  await fetch(`${ENV.WEBVIEW_BASE_URL}/api/profile/push-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ token, platform }),
  });
}

export function attachForegroundHandler() {
  return messaging().onMessage(async (remote) => {
    await notifee.displayNotification({
      title: remote.notification?.title,
      body: remote.notification?.body,
      data: remote.data,
      android: { channelId: CHANNEL_ID, smallIcon: 'ic_launcher' },
      ios: { sound: 'default' },
    });
  });
}
