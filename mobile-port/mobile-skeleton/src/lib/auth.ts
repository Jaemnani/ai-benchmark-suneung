import { Platform } from 'react-native';
import {
  appleAuth,
  AppleAuthRequestOperation,
  AppleAuthRequestScope,
} from '@invertase/react-native-apple-authentication';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as Keychain from 'react-native-keychain';

import { supabase } from '@mobile/lib/supabase';
import { ENV } from '@mobile/env';

const KEYCHAIN_SERVICE = 'vote.aib.app.session';

GoogleSignin.configure({
  iosClientId: ENV.GOOGLE_IOS_CLIENT_ID,
  webClientId: ENV.GOOGLE_WEB_CLIENT_ID,
});

export async function signInWithApple() {
  if (Platform.OS !== 'ios') {
    throw new Error('Apple Sign-In is iOS only in v1.0');
  }
  const response = await appleAuth.performRequest({
    requestedOperation: AppleAuthRequestOperation.LOGIN,
    requestedScopes: [AppleAuthRequestScope.EMAIL, AppleAuthRequestScope.FULL_NAME],
  });
  if (!response.identityToken) {
    throw new Error('Apple Sign-In did not return identityToken');
  }
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: response.identityToken,
    nonce: response.nonce,
  });
  if (error) throw error;
  if (!data.session) throw new Error('No session returned from Supabase');
  await persistSession(data.session);
  return data.session;
}

export async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices();
  const userInfo = await GoogleSignin.signIn();
  const idToken = userInfo.data?.idToken;
  if (!idToken) throw new Error('Google Sign-In did not return idToken');
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;
  if (!data.session) throw new Error('No session returned from Supabase');
  await persistSession(data.session);
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
  try {
    await GoogleSignin.signOut();
  } catch {
    // ignore
  }
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
}

async function persistSession(session: {
  access_token: string;
  refresh_token: string;
}) {
  await Keychain.setGenericPassword(
    'session',
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }),
    {
      service: KEYCHAIN_SERVICE,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    },
  );
}

export async function restoreSessionWithBiometrics(): Promise<boolean> {
  try {
    const stored = await Keychain.getGenericPassword({
      service: KEYCHAIN_SERVICE,
      authenticationPrompt: { title: 'aib에 로그인하려면 인증하세요' },
    });
    if (!stored) return false;
    const parsed = JSON.parse(stored.password) as {
      access_token: string;
      refresh_token: string;
    };
    const { error } = await supabase.auth.setSession(parsed);
    return !error;
  } catch {
    return false;
  }
}

export { statusCodes as googleStatusCodes };
