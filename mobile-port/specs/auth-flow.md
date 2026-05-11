# 인증 흐름 — 네이티브 SDK → Supabase → WebView 쿠키

## 1. 문제

기존 웹: 브라우저 OAuth → `supabase.auth.exchangeCodeForSession` → SSR 쿠키. 이걸 WebView 안에서 그대로 시도하면 iOS WKWebView의 cross-site cookie / SFAuthSession 정책으로 막힌다.

## 2. 모바일 권장 흐름

```
[Login.tsx — 네이티브 화면]
  │
  ├─ "Apple로 계속하기" 클릭
  │    @invertase/react-native-apple-authentication
  │    → ID token + nonce
  │
  ├─ "Google로 계속하기" 클릭
  │    @react-native-google-signin/google-signin
  │    → ID token + nonce
  │
  ▼
supabase.auth.signInWithIdToken({ provider, token, nonce })
  ▼
session = { access_token, refresh_token, expires_at, user }
  │
  ├─ (1) AsyncStorage 저장 (Supabase client autoRefreshToken)
  ├─ (2) Keychain 저장 (생체 인증 unlock 용)
  │
  ▼
navigation.replace('Home')   // 네이티브 홈 진입
```

## 3. WebView로 세션 전달

WebView로 콘텐츠 페이지 진입 시 SSR이 인증 상태로 응답해야 한다. 두 가지 방법:

### 방법 A: Supabase 쿠키 직접 발급 (권장)

WebView 초기 진입 시 `injectedJavaScriptBeforeContentLoaded` 로 다음 주입:

```js
// 토큰 두 개를 inject (안전한 방법: WebView source.headers는 1회성이라 navigation 후 사라짐)
window.__AIB_SESSION__ = { access_token: '...', refresh_token: '...' };
```

그리고 첫 페이지의 `<head>` 또는 client component에서:

```ts
// src/lib/native-bridge.ts에 함수 추가
import { createBrowserClient } from '@supabase/ssr';

if (typeof window !== 'undefined' && window.__AIB_SESSION__) {
  const supabase = createBrowserClient(URL, ANON);
  await supabase.auth.setSession(window.__AIB_SESSION__);
  delete window.__AIB_SESSION__;
  // 이제 Supabase가 sb-access-token, sb-refresh-token 쿠키를 set → SSR이 받음
  // 단, 다음 navigation부터 쿠키 적용. 현재 페이지는 location.reload() 필요할 수 있음
}
```

### 방법 B: Custom Header 1회 + 서버에서 쿠키로 변환

신규 endpoint `POST /api/auth/native-session` — body로 `{access_token, refresh_token}`을 받아 검증 후 쿠키 발급. WebView 진입 시 1회 호출.

**v1.0은 방법 A 권장** (백엔드 변경 0).

## 4. 토큰 갱신

- Supabase client (RN) `autoRefreshToken: true` → AsyncStorage 자동 갱신.
- WebView 안 쿠키는 SSR이 자체 갱신 (기존 `@supabase/ssr` 미들웨어).
- 모순 위험: RN 측 토큰과 WebView 쿠키가 어긋날 수 있음 → 정기적으로 RN이 토큰 검증 후 WebView reload.

## 5. 로그아웃

```ts
// mobile/src/lib/auth.ts
async function signOut() {
  await supabase.auth.signOut();              // AsyncStorage 클리어
  await Keychain.resetGenericPassword();      // 생체 unlock 데이터
  webViewRef.current?.injectJavaScript(`document.cookie.split(';').forEach(c => { document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/'); });`);
  webViewRef.current?.reload();
  navigation.replace('Login');
}
```

## 6. 생체 인증 (재방문 시)

```ts
// mobile/src/App.tsx 콜드 스타트
useEffect(() => {
  (async () => {
    const stored = await Keychain.getGenericPassword();
    if (!stored) return navigation.replace('Login');
    const biometryType = await Keychain.getSupportedBiometryType();
    if (biometryType) {
      const ok = await Keychain.getGenericPassword({
        authenticationPrompt: { title: 'aib에 로그인하려면 인증하세요' },
      });
      if (ok) {
        const session = JSON.parse(ok.password);
        await supabase.auth.setSession(session);
        navigation.replace('Home');
      } else navigation.replace('Login');
    }
  })();
}, []);
```

## 7. Supabase 콘솔 변경

- Apple Provider: 활성화 → Service ID(`vote.aib.app.signin`), Team ID, Key ID, .p8 업로드, return URL 입력.
- Google Provider: iOS OAuth Client ID 추가, redirect는 사용 안 함 (ID token 직접 교환).

## 8. 보안 검토

- ID token + nonce 검증은 Supabase가 처리 (Apple JWT 서명, Google JWKS).
- AsyncStorage는 plaintext → 토큰은 Keychain(iOS)/EncryptedSharedPreferences(Android)로 이중 저장 권장. `react-native-keychain` 단일 라이브러리로 둘 다 추상.
- 토큰 유효기간: Supabase 기본 1시간 (refresh 60일). 모바일에서 expires_at 기준 자동 refresh.

## 9. 신규 / 변경 파일

| 파일 | 위치 | 내용 |
|---|---|---|
| `mobile/src/lib/auth.ts` | mobile | signInWithApple, signInWithGoogle, signOut, restoreSession |
| `mobile/src/lib/supabase.ts` | mobile | createClient with AsyncStorage |
| `mobile/src/screens/Login.tsx` | mobile | Apple/Google 버튼 UI (Apple 최상단 — Guideline 4.8) |
| `mobile/src/screens/WebViewScreen.tsx` | mobile | injectedJavaScriptBeforeContentLoaded 세션 주입 |
| `src/lib/native-bridge.ts` | web (신규) | window.__AIB_SESSION__ 처리 헬퍼 |
| Supabase 콘솔 | (수동) | Apple/Google Provider 설정 |
