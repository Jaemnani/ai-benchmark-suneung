# web-patches/

`Jaemnani/knowai-space` 본 레포에 적용할 신규 파일과 패치.

## 적용 순서

1. `knowai-space`에서 신규 브랜치 생성:
   ```bash
   cd /home/user/knowai-space
   git checkout -b feat/mobile-bridge-monorepo
   ```

2. **루트 설정** (3개 파일, diff/덮어쓰기):
   - `package.json.patch.md` 안내대로 `package.json`에 workspaces 추가
   - `.lintstagedrc.json` 새로 추가 (root에 복사)
   - `.vercelignore` 새로 추가 (root에 복사)
   - `eslint.config.mjs.patch.md` 안내대로 ignores 추가

3. **신규 라이브러리 파일** (그대로 복사):
   - `src/lib/native-bridge.ts` → `knowai-space/src/lib/native-bridge.ts`
   - `src/lib/pricing-iap.ts` → `knowai-space/src/lib/pricing-iap.ts`
   - `src/lib/push-fcm.ts` → `knowai-space/src/lib/push-fcm.ts`

4. **신규 API routes** (그대로 복사):
   - `src/app/api/profile/push-token/route.ts` → `knowai-space/src/app/api/profile/push-token/route.ts`
   - `src/app/api/credits/iap-webhook/route.ts` → `knowai-space/src/app/api/credits/iap-webhook/route.ts`

5. **.well-known 도메인 검증** (TEAMID + SHA 채우기):
   - `public/.well-known/apple-app-site-association` (확장자 없음) → `knowai-space/public/.well-known/apple-app-site-association`
   - `public/.well-known/assetlinks.json` → `knowai-space/public/.well-known/assetlinks.json`

6. **마이그레이션** (`specs/supabase-migrations.md` 참조):
   - `<ts>_add_push_fields_to_profiles.sql`
   - `<ts>_add_iap_support_to_credit_batches.sql`
   - `<ts>_add_credits_iap_function.sql`

7. **환경 변수** `.env.example` 갱신 — `web-patches/.env.example.append`의 내용을 append.

8. **검증 후 커밋, 사용자 명시 허락 전까지 main / Vercel Production push 금지**.
