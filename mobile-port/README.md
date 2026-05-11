# aib.vote → iOS/Android 모바일 포팅 사양 (v3)

본 디렉터리는 **`Jaemnani/knowai-space`** 레포(`/home/user/knowai-space`, Next.js 16)를 iOS/Android 모바일 앱으로 포팅하기 위한 **실행 가능한 사양과 패치 묶음**이다.

> 본 레포(`AI-benchmark-suneung`)는 별개의 Python 프로젝트이며, knowai-space 레포에 대한 push 권한이 본 세션에 부여되지 않았기 때문에 사양만 본 레포의 `claude/nextjs-to-mobile-app-iNQ5J` 브랜치에 보관한다. 실제 적용은 사용자가 knowai-space 레포의 별도 브랜치(예: `feat/mobile-bridge-monorepo`)에 본 디렉터리의 산출물을 옮긴 뒤 진행한다.

## 사용자 결정 (2026-05-11)

| 항목 | 선택 |
|---|---|
| v1.0 출시 전략 | **옵션 B (부분 네이티브)** — RN 셸 + 콘텐츠 WebView |
| 모바일 IAP 범위 | **데모 상품 1개** (`credits_starter`) |
| 레포 구조 | **모노레포** (`knowai-space/mobile/`, npm workspaces) |

## 디렉터리 안내

```
mobile-port/
├── README.md                       ← 본 파일
├── PLAN.md                         ← 전체 계획 (Phase 1-5, 일정, Critical Files, 검증)
├── specs/
│   ├── architecture.md             ← 모노레포 구조, 워크스페이스, 격리(lint-staged/vercel)
│   ├── auth-flow.md                ← 네이티브 SDK → Supabase signInWithIdToken → WebView 쿠키
│   ├── iap-flow.md                 ← RevenueCat 데모 상품 1개 + webhook → credit_batches
│   ├── push-flow.md                ← FCM 단일 SDK (APNs 통합), profiles.push_* 마이그레이션
│   ├── deeplink-flow.md            ← Universal Links / App Links / .well-known
│   ├── apple-4-2-checklist.md      ← 출시 전 필수 충족 항목
│   └── supabase-migrations.md      ← 신규 컬럼/인덱스/체크 제약 SQL
├── web-patches/                    ← knowai-space 본 레포에 적용할 신규 파일/패치
│   ├── package.json.diff           ← workspaces, scripts
│   ├── .lintstagedrc.json          ← (신규)
│   ├── .vercelignore               ← (신규)
│   ├── eslint.config.mjs.diff      ← ignores 확장
│   ├── src/lib/native-bridge.ts    ← (신규)
│   ├── src/lib/pricing-iap.ts      ← (신규)
│   ├── src/lib/push-fcm.ts         ← (신규)
│   ├── src/app/api/profile/push-token/route.ts        ← (신규)
│   ├── src/app/api/credits/iap-webhook/route.ts       ← (신규)
│   ├── public/.well-known/apple-app-site-association  ← (신규, 템플릿)
│   └── public/.well-known/assetlinks.json             ← (신규, 템플릿)
└── mobile-skeleton/                ← knowai-space/mobile/ 의 시드 파일
    ├── package.json
    ├── tsconfig.json
    ├── babel.config.js
    ├── metro.config.js
    ├── app.json
    └── src/
        ├── App.tsx
        ├── screens/Home.tsx
        ├── screens/Login.tsx
        ├── screens/MyPage.tsx
        ├── screens/Plans.tsx
        ├── screens/WebViewScreen.tsx
        ├── navigation/RootStack.tsx
        ├── lib/auth.ts
        ├── lib/iap.ts
        ├── lib/push.ts
        ├── lib/deeplink.ts
        ├── lib/supabase.ts
        ├── lib/locale.ts
        └── lib/native-inject.ts
```

## 다음 액션

1. `Jaemnani/knowai-space`에서 `feat/mobile-bridge-monorepo` 브랜치 생성
2. `web-patches/`의 신규 파일을 그대로 복사 + `*.diff`를 수동 적용
3. `cd /home/user/knowai-space && npx @react-native-community/cli@latest init AibMobile --directory mobile --skip-install --pm npm`
4. `mobile-skeleton/`의 시드 파일로 `mobile/src/` 덮어쓰기 (생성된 기본 `App.tsx` 대체)
5. `npm install` (루트, 워크스페이스 부트스트랩)
6. 플랫폼 등록 (App Store Connect, Play Console, RevenueCat, FCM/APNs)
7. **사용자 명시 허락 전까지 main / Vercel Production push 금지** (CLAUDE.md 규칙)
