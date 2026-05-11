# 아키텍처 — 모노레포 + 부분 네이티브

## 1. 디렉터리 계층 (knowai-space 적용 시)

```
knowai-space/
├── package.json              # workspaces 추가
├── .lintstagedrc.json        # 신규
├── .vercelignore             # 신규
├── eslint.config.mjs         # ignores 확장
├── src/                      # 기존 Next.js (변경 최소)
├── public/.well-known/       # 신규 (apple-app-site-association, assetlinks.json)
└── mobile/                   # 신규 워크스페이스 (RN CLI 산출)
    ├── package.json          # name: @aib/mobile
    ├── src/{screens,navigation,lib}/...
    ├── ios/                  # Xcode 프로젝트
    └── android/              # Gradle 프로젝트
```

## 2. 빌드 / 배포 격리

- **Vercel**: `.vercelignore`에 `mobile/`, `ios/`, `android/`, `**/*.xcworkspace`, `**/*.gradle` 추가 → 웹 빌드는 mobile 산출물을 무시.
- **lint-staged**: 기존 root `*.{ts,tsx}` 글롭이 mobile 트리를 긁지 않도록 `.lintstagedrc.json`에서 스코프를 `src/**`로 좁힘. mobile 측은 `mobile/src/**`만 lint.
- **eslint**: `mobile/{ios,android,Pods,node_modules}` 무시.
- **husky pre-commit**: 변경 없음 (`npx lint-staged` 그대로).
- **TypeScript**: 루트 `tsconfig.json`은 `@/*` → `./src/*` 유지. `mobile/tsconfig.json`은 독립 (`@mobile/*` → `./src/*`).

## 3. 공유 자원 (선택)

| 자원 | 공유 전략 | 우선순위 |
|---|---|---|
| API 타입 (Supabase generated, route input/output) | `packages/contracts/` 추가 후 양쪽 import — **v1.1+ 권장** | low |
| i18n 메시지 | RN은 별도 `mobile/src/i18n/`. 웹 메시지 SSOT는 `messages/{ko,ja,en}.json` — v1.1+에 부분 공유 | low |
| 디자인 토큰 | Tailwind 토큰을 `mobile/src/theme.ts` 수동 미러 | low |

v1.0은 공유 패키지 없이 시작. 중복 비용 < 추상화 비용.

## 4. CI/CD 분리

- 웹 CI: 기존 GitHub Actions (없으면 Vercel 빌드만). 변경 없음.
- 모바일 CI (옵션, v1.0 후):
  - iOS: Fastlane + Match + TestFlight 업로드
  - Android: Gradle + Play Console internal track
  - 두 워크플로 모두 `paths: ['mobile/**']` 트리거.

## 5. 환경 변수 분리

- 웹 `.env`: 기존 그대로 + 신규 `REVENUECAT_WEBHOOK_SECRET`, `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON`(base64).
- 모바일 `.env`(react-native-config): `RC_API_KEY_IOS`, `RC_API_KEY_ANDROID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_WEB_CLIENT_ID`.
- **절대 공유 금지**: Stripe secret, Supabase service_role, RevenueCat webhook secret.

## 6. 보안 헤더 / CORS

- WebView 내부에서 호출되는 API는 origin 헤더가 `https://www.aib.vote` (server.url=null이고 LoadHTMLString이 아닐 때). 신규 `/api/credits/iap-webhook`은 외부 RevenueCat IP만 허용 → Authorization 헤더 + 서명 검증.
- 신규 `/api/profile/push-token`은 기존 Supabase 쿠키 세션 사용 → 추가 CORS 필요 없음.

## 7. 출시 후 운영

- Crashlytics(Firebase) 또는 Sentry RN: 모바일 전용 DSN.
- RevenueCat 대시보드: 실시간 매출 + churn.
- Vercel Analytics: 웹/WebView 트래픽 그대로.
- 새 버전 배포 시: 웹은 Vercel(즉시), 모바일은 App Store/Play Store 심사(평균 24h-3d).
