/**
 * 네이티브 셸(RN)이 WebView 첫 로드 직전 주입하는 글로벌 객체.
 * 웹에서는 `isNative()`로 분기해 모바일 전용 UX(IAP 버튼, 푸시 권한 UI, 네이티브 공유 등)를 켠다.
 *
 * 주입 시점: RN WebView의 `injectedJavaScriptBeforeContentLoaded`.
 * 주입 형식:
 *   window.AIB_NATIVE = {
 *     platform: 'ios' | 'android',
 *     version: '1.0.0',
 *     capabilities: ['iap', 'push', 'biometric', 'share', 'haptics'],
 *   };
 *   window.__AIB_SESSION__ = { access_token, refresh_token };  // (옵션) 인증 전달
 */

export type NativePlatform = 'ios' | 'android';

export type NativeCapability =
  | 'iap'
  | 'push'
  | 'biometric'
  | 'share'
  | 'haptics'
  | 'deeplink';

export interface AibNativeBridge {
  platform: NativePlatform;
  version: string;
  capabilities: NativeCapability[];
}

export interface AibNativeSession {
  access_token: string;
  refresh_token: string;
}

declare global {
  interface Window {
    AIB_NATIVE?: AibNativeBridge;
    __AIB_SESSION__?: AibNativeSession;
    /**
     * RN에서 WebView로 보낸 메시지에 대한 핸들러를 web 측에서 등록할 때 사용.
     * RN → WebView: `webViewRef.current.injectJavaScript('window.__AIB_RX__?.({type:"share-result", ok:true})')`
     */
    __AIB_RX__?: (msg: { type: string; [k: string]: unknown }) => void;
  }
}

export const isNative = (): boolean =>
  typeof window !== 'undefined' && !!window.AIB_NATIVE;

export const nativePlatform = (): NativePlatform | null =>
  typeof window !== 'undefined' ? window.AIB_NATIVE?.platform ?? null : null;

export const nativeVersion = (): string | null =>
  typeof window !== 'undefined' ? window.AIB_NATIVE?.version ?? null : null;

export const nativeHasCap = (cap: NativeCapability): boolean =>
  isNative() && !!window.AIB_NATIVE?.capabilities.includes(cap);

/**
 * WebView에서 RN으로 메시지 전송.
 * RN 측은 `<WebView onMessage={({nativeEvent}) => handle(JSON.parse(nativeEvent.data))} />`로 받는다.
 */
export function postToNative(msg: { type: string; [k: string]: unknown }): void {
  if (typeof window === 'undefined') return;
  // RN WebView는 window.ReactNativeWebView.postMessage(string)을 노출
  const rn = (
    window as unknown as {
      ReactNativeWebView?: { postMessage: (data: string) => void };
    }
  ).ReactNativeWebView;
  if (rn) rn.postMessage(JSON.stringify(msg));
}

/**
 * 네이티브 측에서 발급한 Supabase 세션을 WebView에 주입하기 위해
 * 첫 클라이언트 컴포넌트에서 1회 호출. 호출 후 window.__AIB_SESSION__은 삭제.
 *
 * 호출처: `src/app/[locale]/(main)/layout.tsx` 또는 전용 client 컴포넌트.
 *
 * @example
 *   'use client';
 *   import { useEffect } from 'react';
 *   import { consumeNativeSession } from '@/lib/native-bridge';
 *   import { createBrowserClient } from '@/lib/supabase/client';
 *   useEffect(() => { consumeNativeSession(createBrowserClient()); }, []);
 */
export async function consumeNativeSession(supabase: {
  auth: {
    setSession: (session: AibNativeSession) => Promise<unknown>;
  };
}): Promise<boolean> {
  if (typeof window === 'undefined' || !window.__AIB_SESSION__) return false;
  const session = window.__AIB_SESSION__;
  try {
    await supabase.auth.setSession(session);
    return true;
  } finally {
    delete window.__AIB_SESSION__;
  }
}
