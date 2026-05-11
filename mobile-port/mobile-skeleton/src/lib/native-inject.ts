import { Platform } from 'react-native';

import type { Session } from '@supabase/supabase-js';

const APP_VERSION = '1.0.0';
const CAPABILITIES = ['iap', 'push', 'biometric', 'share', 'haptics', 'deeplink'];

/**
 * WebView 첫 로드 직전 주입할 JS 문자열을 생성.
 * `<WebView injectedJavaScriptBeforeContentLoaded={getInjectScript(session)} />`
 */
export function getInjectScript(session: Session | null): string {
  const bridge = {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    version: APP_VERSION,
    capabilities: CAPABILITIES,
  };
  const sessionLine = session
    ? `window.__AIB_SESSION__ = ${JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })};`
    : '';
  return `
    (function() {
      try {
        window.AIB_NATIVE = ${JSON.stringify(bridge)};
        ${sessionLine}
      } catch (e) {
        // swallow — WebView must not crash on injection
      }
      true;
    })();
  `;
}
