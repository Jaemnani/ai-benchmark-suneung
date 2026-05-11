# 딥링크 — Universal Links (iOS) / App Links (Android)

## 1. 목표

`https://www.aib.vote/news/<slug>` 같은 URL을 메신저/SNS에서 클릭 → 모바일 앱이 설치되어 있으면 앱으로 진입, 없으면 웹으로 fallback.

## 2. iOS — Universal Links

### 2.1 Associated Domains 설정

Xcode → Project → Signing & Capabilities → Associated Domains:
```
applinks:www.aib.vote
applinks:aib.vote
```

### 2.2 `.well-known/apple-app-site-association`

위치: `https://www.aib.vote/.well-known/apple-app-site-association`

**중요**:
- 확장자 없음 (`.json` 붙이면 Apple이 인식 안 함)
- Content-Type: `application/json` (Vercel은 자동 추론하지만 강제하는 게 안전)
- HTTPS only, **리다이렉트 절대 금지** (Apple validator 실패)
- File size <= 128KB

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.vote.aib.app",
        "paths": [
          "NOT /api/*",
          "NOT /.well-known/*",
          "NOT /admin/*",
          "/",
          "/ko/*",
          "/ja/*",
          "/en/*",
          "/news/*",
          "/class/*",
          "/workshop/*",
          "/plans*",
          "/mypage*"
        ]
      }
    ]
  },
  "webcredentials": {
    "apps": ["TEAMID.vote.aib.app"]
  }
}
```

`TEAMID`는 Apple Developer 계정의 Team ID (10자). 앱 등록 후 채워야 함.

## 3. Android — App Links

### 3.1 AndroidManifest.xml

```xml
<activity android:name=".MainActivity" android:exported="true">
  <intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="www.aib.vote" />
    <data android:scheme="https" android:host="aib.vote" />
  </intent-filter>
</activity>
```

### 3.2 `.well-known/assetlinks.json`

위치: `https://www.aib.vote/.well-known/assetlinks.json` (확장자 있어도 됨)

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "vote.aib.app",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:DD:..."
      ]
    }
  }
]
```

SHA-256 지문:
- Debug: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android` 의 `SHA256`
- Release: `keytool -list -v -keystore <release.keystore> -alias <alias>` 의 `SHA256`
- Play App Signing 사용 시 Play Console → 앱 → 무결성 → 앱 서명 키 인증서 SHA-256

두 지문을 배열에 모두 넣을 수 있음.

## 4. Vercel 미들웨어 검증

`/home/user/knowai-space/src/middleware.ts:128` matcher가 `.well-known` 경로를 통과시키는지 확인.

현재 (`src/middleware.ts` 추정):
```ts
export const config = {
  matcher: ['/((?!_next|api|auth/callback|login|test|.*\\..*).*)'],
};
```
정적 파일 allowlist 패턴이므로 `apple-app-site-association`(확장자 없음)이 정규식에 걸려 미들웨어를 통과해 next-intl 프록시로 갈 수 있음. **검증 필수**:

```bash
curl -I https://www.aib.vote/.well-known/apple-app-site-association
# 기대: HTTP/2 200, content-type: application/json, location 헤더 없음, x-vercel-cache: HIT 가능
```

리다이렉트가 발생하거나 404가 뜨면 matcher에 음수 패턴 추가:
```ts
matcher: ['/((?!_next|\\.well-known|api|auth/callback|login|test|.*\\..*).*)'],
```

## 5. RN 측 딥링크 핸들러

```ts
// mobile/src/lib/deeplink.ts
import { Linking } from 'react-native';
import type { NavigationContainerRef } from '@react-navigation/native';

const NATIVE_ROUTES: Record<string, (slug?: string) => any> = {
  '/': () => ({ screen: 'Home' }),
  '/mypage': () => ({ screen: 'MyPage' }),
  '/plans': () => ({ screen: 'Plans' }),
  '/login': () => ({ screen: 'Login' }),
};

export function parseUrlToRoute(url: string) {
  try {
    const u = new URL(url);
    // 로케일 prefix 벗기기: /ja/news/foo → /news/foo
    const pathWithoutLocale = u.pathname.replace(/^\/(ko|ja|en)/, '') || '/';
    for (const [pattern, builder] of Object.entries(NATIVE_ROUTES)) {
      if (pathWithoutLocale === pattern) return builder();
    }
    // 나머지는 WebViewScreen으로
    return { screen: 'WebViewScreen', params: { path: u.pathname + u.search } };
  } catch {
    return { screen: 'Home' };
  }
}

export function attachLinkingListener(navRef: NavigationContainerRef<any>) {
  Linking.getInitialURL().then((url) => {
    if (url) {
      const route = parseUrlToRoute(url);
      navRef.navigate(route.screen, route.params);
    }
  });
  const sub = Linking.addEventListener('url', ({ url }) => {
    const route = parseUrlToRoute(url);
    navRef.navigate(route.screen, route.params);
  });
  return () => sub.remove();
}
```

## 6. 검증

### iOS
- Apple validator: https://search.developer.apple.com/appsearch-validation-tool/
- 실기기: `xcrun simctl openurl booted https://www.aib.vote/news/test-slug` → 앱 진입
- Notes 앱에 URL 붙여넣고 길게 눌러서 "aib에서 열기" 메뉴 표시 확인

### Android
- 검증: `adb shell pm get-app-links vote.aib.app` → `Status: verified` 표시
- 실기기: `adb shell am start -W -a android.intent.action.VIEW -d "https://www.aib.vote/news/test-slug"` → 앱 진입
- Digital Asset Links validator: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://www.aib.vote&relation=delegate_permission/common.handle_all_urls`

## 7. 멀티 도메인 처리

`aib.news`, `aib.academy`, `aib.app` 도메인은 미들웨어에서 `www.aib.vote`로 리다이렉트 (기존 동작). 이 도메인으로 들어온 딥링크는:

- 옵션 1: AASA/assetlinks에 모든 도메인 등록 → 모두 앱 진입 가능 (권장)
- 옵션 2: 리다이렉트 의존 → 브라우저가 먼저 열리고 `www.aib.vote`로 리다이렉트 후 앱 진입 (UX 나쁨, iOS는 후속 redirect를 앱으로 안 보냄)

v1.0은 옵션 1 권장. AASA에 `applinks:aib.news`, `applinks:aib.academy`, `applinks:aib.app` 추가 + 각 도메인 `.well-known/apple-app-site-association` 호스팅 (Vercel 같은 프로젝트라 자동 적용).

## 8. 신규 / 변경 파일

| 파일 | 위치 | 신규/수정 |
|---|---|---|
| `public/.well-known/apple-app-site-association` | web | 신규 |
| `public/.well-known/assetlinks.json` | web | 신규 |
| `src/middleware.ts` | web | (검증 후) 음수 패턴 추가 |
| `mobile/src/lib/deeplink.ts` | mobile | 신규 |
| `mobile/ios/AibMobile/AibMobile.entitlements` | mobile | Associated Domains |
| `mobile/android/app/src/main/AndroidManifest.xml` | mobile | intent-filter |
| Apple Developer 콘솔 | (수동) | Associated Domains capability |
