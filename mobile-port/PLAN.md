# aib.vote → iOS/Android 앱 포팅 계획 (v3 — 사용자 결정 반영)

> **타깃 코드베이스**: `/home/user/knowai-space` (Next.js 16, 본 계획의 모든 코드 경로 기준)
> **사용자 결정 (2026-05-11)**:
> 1. **v1.0 전략 = 옵션 B (부분 네이티브)** — RN 셸 + 콘텐츠 WebView
> 2. **IAP 범위 = 데모 상품 1개** (4.2/3.1.1 통과 + 결제 검증용)
> 3. **레포 구조 = 모노레포** (`knowai-space/mobile/`, npm workspaces)

---

## 0. Context (왜 이 변경이 필요한가)

`aib.vote`는 Next.js App Router + 155개 API route + Supabase + Stripe + 13개 Vercel Cron + AI SSE 스트리밍 기반의 **서버 의존 강도가 높은** 웹앱이다. Capacitor만으로 정적 export하는 경로는 불가능하다 (서버 컴포넌트, 미들웨어, Cron, 서버 액션, SSE 모두 필수). 따라서 백엔드(Vercel)는 그대로 유지하고 모바일은 다음 갈래로 진행한다.

**선택된 v1.0 전략 (옵션 B)**: React Native 셸이 hot 화면(홈/로그인/마이페이지/하단 탭 네비게이션)을 네이티브로 그리고, 콘텐츠/롱테일 페이지(news/class/workshop/plans/terms 등 25개 main 라우트)는 WebView로 기존 SSR/ISR HTML을 재활용한다. 옵션 A(전체 WebView)보다 Apple 4.2 통과 안정성이 높고, 옵션 B(완전 네이티브 재작성)보다 작업량이 작다. 6-9개월 예상.

**왜 Apple 4.2가 핵심**: 모바일이 WebView 래퍼처럼 보이면 Apple App Review Guideline 4.2 Minimum Functionality로 즉시 리젝된다. 진입 화면들이 네이티브여야 통과 안정성이 높다.

---

## 1. 아키텍처 결정 요약

| 결정 | 값 | 근거 |
|---|---|---|
| 셸 프레임워크 | **React Native (CLI, not Expo Go)** | Native modules(IAP, push, biometric) 필요. Expo bare workflow도 가능하지만 RN CLI가 직접적. |
| 레포 구조 | **모노레포** (`knowai-space/mobile/`, npm workspaces) | 사용자 선택. API 타입/i18n 메시지/디자인 토큰 공유 용이. |
| 패키지 매니저 | npm (기존 그대로) | 본 레포 lock 그대로. |
| IAP 범위 v1.0 | **데모 상품 1개** (`credits_starter`) | 4.2/3.1.1 통과 + 결제 파이프라인 검증. Stripe 웹 결제는 유지. |
| IAP 게이트웨이 | **RevenueCat** | 영수증 검증/플랫폼 추상화/Webhook 단일화. 무료 한도($2.5K MTR) 내 충분. |
| 네이티브 화면 | `/` (home), `/login`, `/mypage`, 하단 탭 네비게이션, **`/plans` (IAP UI 필요)** | 결제는 네이티브 화면 안에서만 — Apple 3.1.1 |
| WebView 화면 | 나머지 22개 main 라우트 + marketing | 콘텐츠 ISR 재활용 |
| 인증 | 네이티브 SDK → ID 토큰 → `supabase.auth.signInWithIdToken()` → 세션을 WebView 쿠키로 전달 | iOS WKWebView OAuth 우회 |
| 다국어 | RN: device locale → 경로 prefix(`/ja/`, `/en/`); next-intl은 path-based (`localePrefix: 'as-needed'`) | `src/i18n/routing.ts` 확인 완료 |

---

## 2. 모노레포 구조

```
knowai-space/                          # 본 레포 루트
├── package.json                       # ★ workspaces 필드 추가, lint-staged glob 축소
├── .lintstagedrc.json                 # (신규) mobile/ 경로 제외
├── tsconfig.json                      # paths 변경 없음 (web만 @/*)
├── eslint.config.mjs                  # globalIgnores에 mobile/, ios/, android/, Pods/ 추가
├── vercel.json                        # 변경 없음 (mobile/는 Vercel 빌드에서 자동 무시)
├── .vercelignore                      # (신규) mobile/, ios/, android/ 명시 무시
├── src/                               # 기존 Next.js (변경 최소)
│   ├── lib/native-bridge.ts           # (신규) isNative(), nativePlatform()
│   ├── lib/pricing-iap.ts             # (신규) Stripe price ↔ RevenueCat SKU 매핑 (1개)
│   └── app/api/credits/iap-webhook/route.ts  # (신규) RevenueCat webhook
├── public/.well-known/                # (신규)
│   ├── apple-app-site-association
│   └── assetlinks.json
└── mobile/                            # (신규 워크스페이스)
    ├── package.json                   # name: "@aib/mobile"
    ├── app.json
    ├── index.js
    ├── metro.config.js
    ├── babel.config.js
    ├── tsconfig.json                  # 독립 (paths: @mobile/*)
    ├── src/
    │   ├── screens/Home.tsx
    │   ├── screens/Login.tsx
    │   ├── screens/MyPage.tsx
    │   ├── screens/Plans.tsx          # IAP 데모 상품 1개
    │   ├── screens/WebViewScreen.tsx  # 모든 콘텐츠 라우트 진입
    │   ├── navigation/RootStack.tsx   # bottom tabs + stack
    │   ├── lib/auth.ts                # Apple/Google SDK → Supabase signInWithIdToken
    │   ├── lib/iap.ts                 # RevenueCat init/purchase
    │   ├── lib/push.ts                # FCM/APNs registration
    │   ├── lib/deeplink.ts            # Universal Links → 라우터
    │   ├── lib/supabase.ts            # @supabase/supabase-js (RN, AsyncStorage)
    │   └── lib/locale.ts              # device locale → prefix
    ├── ios/                           # pod install 산출물
    └── android/                       # gradle 산출물
```

### 2.1 워크스페이스 부트스트랩

`package.json` (루트):
```json
{
  "workspaces": ["mobile"],
  "scripts": {
    "mobile:ios": "npm -w @aib/mobile run ios",
    "mobile:android": "npm -w @aib/mobile run android",
    "mobile:start": "npm -w @aib/mobile run start"
  }
}
```

`mobile/package.json`:
```json
{
  "name": "@aib/mobile",
  "private": true,
  "scripts": {
    "start": "react-native start",
    "ios": "react-native run-ios",
    "android": "react-native run-android"
  }
}
```

### 2.2 lint-staged / eslint / vercel 격리

`.lintstagedrc.json` (신규):
```json
{
  "src/**/*.{ts,tsx}": "eslint --fix",
  "src/**/*.{ts,tsx,json,md,css}": "prettier --write",
  "mobile/src/**/*.{ts,tsx}": ["cd mobile && eslint --fix"]
}
```
→ 루트의 글로벌 `*.{ts,tsx}` 글롭이 mobile/ios/Pods를 긁지 않도록 명시.

`eslint.config.mjs`에 추가:
```js
{ ignores: ['mobile/ios/**', 'mobile/android/**', 'mobile/Pods/**', 'mobile/node_modules/**'] }
```

`.vercelignore` (신규):
```
mobile/
ios/
android/
**/*.xcworkspace
**/*.gradle
```

---

## 3. Phase 1 — 셸 스캐폴드 (1-2주)

### 3.1 RN 프로젝트 생성

```bash
cd /home/user/knowai-space
npx @react-native-community/cli@latest init AibMobile --directory mobile --skip-install --pm npm
# bundleId/applicationId를 vote.aib.app 으로 수정
# ios/AibMobile.xcworkspace, android/app/build.gradle 수정
```

### 3.2 핵심 의존성

```bash
cd mobile
npm i @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs \
      react-native-screens react-native-safe-area-context react-native-webview \
      @supabase/supabase-js @react-native-async-storage/async-storage \
      @invertase/react-native-apple-authentication \
      @react-native-google-signin/google-signin \
      react-native-purchases @notifee/react-native @react-native-firebase/app \
      @react-native-firebase/messaging react-native-keychain \
      react-native-haptic-feedback react-native-localize
```

### 3.3 네이티브 인지 분기 (web 측 변경)

`src/lib/native-bridge.ts` (신규):
```ts
declare global {
  interface Window {
    AIB_NATIVE?: {
      platform: 'ios' | 'android';
      version: string;
      capabilities: ('iap' | 'push' | 'biometric' | 'share' | 'haptics')[];
    };
  }
}
export const isNative = () => typeof window !== 'undefined' && !!window.AIB_NATIVE;
export const nativePlatform = () => (typeof window !== 'undefined' ? window.AIB_NATIVE?.platform ?? null : null);
export const nativeHasCap = (c: string) => isNative() && window.AIB_NATIVE!.capabilities.includes(c as any);
```

WebView 측에서 `injectedJavaScriptBeforeContentLoaded`로 `window.AIB_NATIVE = {...}` 주입.

### 3.4 도메인 검증 파일

- `public/.well-known/apple-app-site-association` (확장자 없음, `application/json`, **리다이렉트 절대 금지**)
- `public/.well-known/assetlinks.json`
- `src/middleware.ts:128` matcher가 `.well-known/*`를 통과시키는지 검증 (현재 확장자 allowlist 패턴이라 통과해야 정상). 안 통과하면 matcher 음수 패턴에 `well-known` 추가.

---

## 4. Phase 2 — 네이티브 화면 + 브리지 (8-12주)

### 4.1 네이티브 화면 5개 (RN)

| 화면 | 책임 | 핵심 API |
|---|---|---|
| `Home.tsx` | 환영 + 추천 카드 그리드 + 하단 탭 진입 | `/api/recommendations` (신규 RN 전용, 또는 기존 SSR 재활용) |
| `Login.tsx` | Apple/Google 버튼 → ID token → Supabase signInWithIdToken | `supabase.auth.signInWithIdToken({provider, token, nonce})` |
| `MyPage.tsx` | 프로필/크레딧/푸시 토픽 토글 | `/api/profile/me`, `/api/credits/balance` |
| `Plans.tsx` | **IAP 데모 상품 1개** (`credits_starter`) | `Purchases.purchaseProduct('credits_starter')` |
| `WebViewScreen.tsx` | 모든 콘텐츠 라우트 진입점 | `react-native-webview` + 쿠키 동기화 |

### 4.2 IAP 데모 상품 1개 — 통합 상세

**SKU**: `credits_starter` (Apple Tier 1 = $0.99 / ₩1,500 / ¥160 정도 — 추후 결정)

**RevenueCat 설정**:
1. 무료 계정 생성, 앱 등록 (iOS + Android)
2. Product: `credits_starter` — Apple/Google 각각 동일 ID
3. Entitlement: `credits.starter` (이걸로 webhook payload 분기)
4. Webhook URL: `https://www.aib.vote/api/credits/iap-webhook` (신규)

**모바일 코드** (`mobile/src/lib/iap.ts`):
```ts
import Purchases from 'react-native-purchases';
export async function initIAP(userId: string) {
  await Purchases.configure({ apiKey: process.env.RC_KEY!, appUserID: userId });
}
export async function purchaseStarter() {
  const products = await Purchases.getProducts(['credits_starter']);
  return Purchases.purchaseStoreProduct(products[0]);
}
```

**Web 백엔드** (`src/app/api/credits/iap-webhook/route.ts`, 신규):
```ts
// RevenueCat → POST { event: { type: 'INITIAL_PURCHASE', app_user_id, product_id, transaction_id, ... } }
// 1. Authorization 헤더로 RC webhook secret 검증
// 2. transaction_id로 멱등 체크 (credit_batches.external_id = transaction_id)
// 3. credit_batches INSERT (source: 'iap_apple' | 'iap_google', amount: 500, expires_at: +12mo)
//    기존 Stripe webhook과 동일한 ledger 함수 (supabase.rpc('add_credits', ...))
// 4. 200 OK
```

**Stripe 가격 매핑** (`src/lib/pricing-iap.ts`, 신규):
```ts
export const IAP_DEMO_SKU = 'credits_starter';
export const IAP_DEMO_CREDITS = 500;  // demo 용. Stripe Starter pack과 같은 금액대로 정렬.
```

**플랜 페이지 분기**:
- `mobile/src/screens/Plans.tsx`: RevenueCat 상품 1개 UI만. 외부 결제 링크 절대 금지.
- 웹 `src/app/[locale]/(main)/plans/page.tsx`: 변경 없음. 단, `if (isNative()) redirect /mobile/plans`처럼 WebView 진입 시 RN 네이티브 화면으로 라우트 (NavigationStateChange 감지).

### 4.3 인증 흐름 (네이티브 → Supabase)

```
[Login.tsx]
  ↓ Apple SDK / Google SDK
ID token + nonce
  ↓
supabase.auth.signInWithIdToken({ provider, token, nonce })
  ↓
session = { access_token, refresh_token }
  ↓ (1) AsyncStorage 저장 (RN auth persist)
  ↓ (2) WebView로 전달
WebView 초기 진입: injectedJavaScriptBeforeContentLoaded 에서
  supabase.auth.setSession(session) 호출 → 쿠키 발급
  ↓
이후 모든 SSR 페이지가 인증 상태로 로드
```

**핵심 파일**:
- `mobile/src/lib/auth.ts` — `signInWithApple()`, `signInWithGoogle()`
- `mobile/src/lib/supabase.ts` — `createClient(url, key, { auth: { storage: AsyncStorage, autoRefreshToken: true } })`
- `mobile/src/screens/WebViewScreen.tsx` — 세션 주입 + 쿠키 정책

**Supabase 콘솔 변경**:
- Apple Provider 활성화 (Service ID, Key ID, Team ID, .p8)
- Google Provider iOS reversed client ID 추가

### 4.4 푸시 (FCM 단일 SDK로 iOS+Android)

- `mobile/src/lib/push.ts`: `messaging().requestPermission()` → `getToken()` → POST `/api/profile/push-token`
- **신규 API**: `src/app/api/profile/push-token/route.ts` — auth된 사용자만, `profiles.push_token`, `profiles.push_platform` UPDATE
- **신규 마이그레이션**: `profiles` 테이블에 `push_token TEXT`, `push_platform TEXT NULL`, `push_topics TEXT[] DEFAULT '{}'`
- **발송 측**: `src/lib/notification-templates.ts` (기존) + 신규 `src/lib/push-fcm.ts` (FCM HTTP v1, APNs는 FCM 콘솔에 .p8 등록으로 통합)
- `/api/cron/auto-news-notify/route.ts` 에 `profiles.push_token IS NOT NULL` 분기 발송 추가

### 4.5 딥링크 (Universal Links / App Links)

- iOS: `Associated Domains` = `applinks:www.aib.vote`, `applinks:aib.vote`
- Android: `intent-filter android:autoVerify="true"` for both hosts
- RN 측: `react-native`의 `Linking.addEventListener('url', ...)` → URL path 파싱 → `navigation.navigate('WebViewScreen', { path })` 또는 네이티브 화면 라우트

### 4.6 기타 네이티브 기능 (4.2 통과용)

| 기능 | 라이브러리 | 트리거 |
|---|---|---|
| 네이티브 공유 | `react-native` `Share` | WebView 내 공유 버튼 클릭 → postMessage → RN Share |
| 햅틱 | `react-native-haptic-feedback` | 좋아요/투표 |
| 생체 인증 | `react-native-keychain` (touchID/faceID) | 콜드 스타트 시 Supabase 세션 unlock |
| 오프라인 배너 | `@react-native-community/netinfo` | 네트워크 끊김 글로벌 토스트 |

---

## 5. Phase 3 — Apple 4.2 회피 (병행, 출시 전 필수)

옵션 B로 가도 4.2 리스크는 0이 아니다. **출시 시점에 다음을 전부 충족**:

1. ✅ 첫 진입 = 네이티브 홈 (WebView 아님)
2. ✅ 로그인 = 네이티브 (Apple Sign-In 버튼 최상단, Guideline 4.8)
3. ✅ 마이페이지 = 네이티브 (프로필 편집, 크레딧 표시)
4. ✅ 결제 = 네이티브 + IAP 1개 작동
5. ✅ 푸시 권한 요청 + 실제 발송 데모 가능
6. ✅ 햅틱/공유/생체 인증 1회 이상 사용 흐름
7. ✅ 딥링크: 외부 URL → 앱 진입 (메신저로 보낸 news 링크 클릭)
8. ✅ 광고 없음, App Privacy 정확 작성, 데모 계정 제공
9. ✅ 심사 노트 영문 — 5+개 네이티브 기능 명시

---

## 6. Phase 4 — 플랫폼 설정 (1주)

### iOS (`mobile/ios/`)
- Bundle ID: `vote.aib.app`
- Capabilities: Push Notifications, Sign in with Apple, Associated Domains, In-App Purchase, Background Modes (Remote notifications)
- Info.plist: `ITSAppUsesNonExemptEncryption=false`, URL schemes (Google reversed client ID, `vote.aib.app` 백업), ATS 기본 유지
- APNs .p8 → FCM 콘솔 업로드
- App Store Connect 앱 등록 + Team ID 확정

### Android (`mobile/android/`)
- applicationId: `vote.aib.app`
- Keystore 생성 + 백업 (1Password) — 분실 시 업데이트 영구 불가
- `AndroidManifest.xml`: `INTERNET`, `POST_NOTIFICATIONS`, intent-filter autoVerify, `usesCleartextTraffic="false"`
- `google-services.json` → `mobile/android/app/`
- Target SDK 34+

### 본 레포 (`/home/user/knowai-space`)
- `public/.well-known/apple-app-site-association`, `assetlinks.json` 추가
- `src/middleware.ts` matcher에서 `.well-known` 경로 통과 확인 (변경 필요 시 음수 패턴 추가)
- `src/lib/native-bridge.ts`, `src/lib/pricing-iap.ts` 추가
- `src/app/api/profile/push-token/route.ts`, `src/app/api/credits/iap-webhook/route.ts` 신규
- 신규 Supabase 마이그레이션: `profiles.push_token`, `profiles.push_platform`, `profiles.push_topics`, `credit_batches.external_id`(인덱스), `credit_batches.source CHECK ('stripe','iap_apple','iap_google')`
- `package.json` workspaces 추가, `.lintstagedrc.json`, `.vercelignore`, `eslint.config.mjs` ignores 확장
- `CLAUDE.md` 갱신: 모노레포 구조, mobile/ 빌드 명령, IAP 흐름, .well-known 라우팅
- **모든 변경은 별도 브랜치 + 커밋만**. CLAUDE.md 규칙대로 사용자 명시 허락까지 main push / Vercel Production 배포 금지

---

## 7. Phase 5 — 베타 & 심사 (3-4주)

- TestFlight 내부(100) → 외부 베타(최대 10,000) → 심사
- Play Console: Internal → Closed Testing (**신규 앱: 14일 / 20명 요건**) → Production
- 관측: Sentry RN + RevenueCat 대시보드 + Vercel Analytics + Crashlytics(옵션)

---

## 8. 일정 추정 (옵션 B)

| Phase | 작업 | 추정 |
|---|---|---|
| 1 | 모노레포 셸 스캐폴드 + 네이티브 인지 분기 + .well-known | 1-2주 |
| 2 | 네이티브 5화면 + 브리지(push/login/iap×1/share/biometric/deeplink) | 8-12주 |
| 3 | 4.2 회피 검증 + 디자인 폴리시 | 2-3주 (병행) |
| 4 | 플랫폼 설정 (iOS/Android) | 1주 |
| 5 | 베타 + 심사 | 3-4주 |
| **합계** | | **6-9개월** |

---

## 9. Critical Files

### 본 레포 변경 / 신규 (`/home/user/knowai-space`)
- `package.json` — workspaces 필드 추가
- `.lintstagedrc.json` — **신규**, mobile/ 제외
- `.vercelignore` — **신규**
- `eslint.config.mjs` — ignores 확장
- `src/middleware.ts` — `.well-known` 통과 검증, 변경 필요 시 음수 패턴 추가
- `src/lib/native-bridge.ts` — **신규**, `isNative()` 외
- `src/lib/pricing-iap.ts` — **신규**, demo SKU 상수
- `src/lib/notification-templates.ts` (기존) + `src/lib/push-fcm.ts` (**신규**)
- `src/app/api/profile/push-token/route.ts` — **신규**
- `src/app/api/credits/iap-webhook/route.ts` — **신규**
- `src/app/api/cron/auto-news-notify/route.ts` — 푸시 토큰 분기 추가
- `src/app/api/credits/checkout/route.ts` — `if (isNative()) 400 'use IAP'` 가드 (안전망)
- `src/app/[locale]/(main)/plans/page.tsx` — 변경 없음 (WebView로는 진입 금지, 네이티브로 라우트)
- `public/.well-known/apple-app-site-association` — **신규**
- `public/.well-known/assetlinks.json` — **신규**
- `CLAUDE.md` — 모노레포 + mobile 빌드 + IAP 흐름 갱신
- Supabase 마이그레이션: `profiles.push_*`, `credit_batches.external_id`/`source`

### 모바일 워크스페이스 (`/home/user/knowai-space/mobile/`)
- `package.json`, `app.json`, `metro.config.js`, `babel.config.js`, `tsconfig.json`
- `src/screens/{Home,Login,MyPage,Plans,WebViewScreen}.tsx`
- `src/navigation/RootStack.tsx`
- `src/lib/{auth,iap,push,deeplink,supabase,locale,native-inject}.ts`
- `ios/AibMobile/Info.plist`, `ios/AibMobile/AppDelegate.swift`
- `android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle`
- `android/app/google-services.json`

---

## 10. 검증 (Phase 5 직전 end-to-end)

### 로컬
- [ ] `npm run mobile:ios` → Simulator 콜드 스타트 <3s, Home 네이티브, 탭 전환 햅틱
- [ ] `npm run mobile:android` → Emulator 동일 시나리오
- [ ] Login.tsx에서 Apple Sandbox → Supabase `auth.users` row 생성 → WebViewScreen 진입 후 `/mypage` 로드 시 인증 상태 유지
- [ ] WebView 안 news 상세에서 공유 버튼 → 네이티브 share sheet
- [ ] Plans.tsx에서 `credits_starter` Sandbox 구매 → RevenueCat 콘솔 거래 표시 → `/api/credits/iap-webhook` 200 → `credit_batches` INSERT 확인 (Supabase Studio)
- [ ] 푸시 토큰 등록 후 FCM 콘솔에서 테스트 발송 → notifee로 표시
- [ ] 딥링크: `adb shell am start -W -a android.intent.action.VIEW -d "https://www.aib.vote/news/<slug>"` → 앱 진입
- [ ] AI 답변 SSE 스트리밍: WebViewScreen에서 askai 페이지 진입 → 토큰 단위 렌더 (WKWebView, Android WebView 모두)

### 정합성
- [ ] `.well-known/apple-app-site-association`: `curl -I https://www.aib.vote/.well-known/apple-app-site-association` → `200`, `Content-Type: application/json`, **리다이렉트 없음**
- [ ] `assetlinks.json`: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://www.aib.vote&relation=delegate_permission/common.handle_all_urls` → 검증 통과
- [ ] Vercel 빌드: `mobile/`가 `.vercelignore`로 제외돼 빌드 산출물에 미포함
- [ ] `npm run lint`(root) — mobile/ 안의 ios/android 산출물 무시 확인

### 심사 직전
- [ ] App Privacy 답변 = 실제 행동 일치 (Supabase Auth, RevenueCat, push token, IP/geo, user_events)
- [ ] 데모 계정 시드 + IAP Sandbox 시연 영상
- [ ] 영문 심사 노트: 네이티브 5+개 기능 명시 (push / Apple Sign-In / IAP / biometric / share / deeplink / haptics)

---

## 11. 즉시 다음 액션 (이 계획 승인 후)

1. **본 레포 `/home/user/knowai-space`에서** branch `feat/mobile-bridge-monorepo` 생성
2. `package.json` workspaces 추가, `.lintstagedrc.json` / `.vercelignore` / eslint ignores 갱신 — **커밋**
3. `src/lib/native-bridge.ts`, `src/lib/pricing-iap.ts`, `public/.well-known/*` placeholder — **커밋**
4. `npx @react-native-community/cli init AibMobile --directory mobile` 으로 RN 워크스페이스 스캐폴드 — **커밋**
5. App Store Connect / Play Console 앱 등록, Team ID / applicationId 확정
6. RevenueCat 무료 계정 + `credits_starter` 상품 1개 등록, webhook secret 발급
7. FCM 프로젝트 + APNs .p8 발급
8. **사용자 명시 허락 받기 전까지 main / Vercel Production push 금지** (CLAUDE.md 규칙)

이 8개가 끝나면 Phase 2 (네이티브 5화면 구현) 진입.
