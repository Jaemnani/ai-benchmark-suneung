import Config from 'react-native-config';

/**
 * mobile/.env 의 키를 타입 안전하게 노출.
 * react-native-config는 환경 변수를 빌드 타임에 inject한다 (런타임 변경 불가).
 */
function required(name: keyof typeof Config): string {
  const value = Config[name];
  if (!value || typeof value !== 'string') {
    throw new Error(`Missing required env: ${String(name)}`);
  }
  return value;
}

export const ENV = {
  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_ANON_KEY: required('SUPABASE_ANON_KEY'),
  RC_API_KEY_IOS: required('RC_API_KEY_IOS'),
  RC_API_KEY_ANDROID: required('RC_API_KEY_ANDROID'),
  GOOGLE_IOS_CLIENT_ID: required('GOOGLE_IOS_CLIENT_ID'),
  GOOGLE_WEB_CLIENT_ID: required('GOOGLE_WEB_CLIENT_ID'),
  WEBVIEW_BASE_URL: required('WEBVIEW_BASE_URL'),
};

export type AppEnv = typeof ENV;
