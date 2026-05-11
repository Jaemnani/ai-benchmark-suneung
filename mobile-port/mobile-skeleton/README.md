# mobile-skeleton/

`knowai-space/mobile/` 워크스페이스에 들어갈 RN 시드 파일.

## 적용 순서

```bash
cd /home/user/knowai-space
# 1. RN 프로젝트 스캐폴드
npx @react-native-community/cli@latest init AibMobile --directory mobile --skip-install --pm npm

# 2. mobile/package.json 이름을 @aib/mobile로 변경 (수동 또는 본 디렉터리 package.json으로 덮어쓰기)

# 3. 본 디렉터리의 src/ 시드 파일을 mobile/src/로 복사 (기본 App.tsx 대체)
cp -r mobile-port/mobile-skeleton/src/* mobile/src/

# 4. 의존성 설치 (워크스페이스로 부트스트랩)
cd /home/user/knowai-space
npm install
cd mobile && npm install \
  @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs \
  react-native-screens react-native-safe-area-context react-native-webview \
  @supabase/supabase-js @react-native-async-storage/async-storage \
  @invertase/react-native-apple-authentication \
  @react-native-google-signin/google-signin \
  react-native-purchases \
  @react-native-firebase/app @react-native-firebase/messaging @notifee/react-native \
  react-native-keychain react-native-haptic-feedback react-native-localize \
  react-native-config @react-native-community/netinfo

# 5. iOS pods
cd ios && pod install

# 6. 개발 실행
cd ../..
npm run mobile:start         # Metro
# 다른 터미널에서:
npm run mobile:ios
# 또는
npm run mobile:android
```

## 디렉터리

```
mobile-skeleton/
├── package.json              # @aib/mobile (RN init 결과 덮어쓰기)
├── tsconfig.json
├── babel.config.js
├── metro.config.js
├── .eslintrc.js
└── src/
    ├── App.tsx
    ├── env.ts                # react-native-config 타입 안전 래퍼
    ├── navigation/
    │   └── RootStack.tsx
    ├── screens/
    │   ├── Home.tsx
    │   ├── Login.tsx
    │   ├── MyPage.tsx
    │   ├── Plans.tsx
    │   └── WebViewScreen.tsx
    └── lib/
        ├── auth.ts
        ├── deeplink.ts
        ├── haptics.ts
        ├── iap.ts
        ├── locale.ts
        ├── native-inject.ts
        ├── push.ts
        ├── share.ts
        └── supabase.ts
```

## 환경 변수 (`mobile/.env`)

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=eyJ...

RC_API_KEY_IOS=appl_xxxxxxxxxxxx
RC_API_KEY_ANDROID=goog_xxxxxxxxxxxx

GOOGLE_IOS_CLIENT_ID=xxxxxxxxxxxx-yyy.apps.googleusercontent.com
GOOGLE_WEB_CLIENT_ID=xxxxxxxxxxxx-zzz.apps.googleusercontent.com

WEBVIEW_BASE_URL=https://www.aib.vote
```

`mobile/.env`는 `.gitignore` 대상. `mobile/.env.example`을 별도로 둘 것.
