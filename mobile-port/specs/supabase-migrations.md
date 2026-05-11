# Supabase 마이그레이션 — 모바일 포팅 v1.0

본 문서는 knowai-space의 `supabase/migrations/` 디렉터리에 추가할 SQL 파일을 정리한다. 파일명은 `<YYYYMMDDHHmm>_<설명>.sql` 형식 (Supabase CLI 컨벤션).

## 1. profiles 푸시 필드 추가

파일: `supabase/migrations/<ts>_add_push_fields_to_profiles.sql`

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT,
  ADD COLUMN IF NOT EXISTS push_platform TEXT CHECK (push_platform IN ('ios', 'android')),
  ADD COLUMN IF NOT EXISTS push_topics TEXT[] NOT NULL DEFAULT ARRAY['breaking-news', 'daily-briefing']::TEXT[];

CREATE INDEX IF NOT EXISTS idx_profiles_push_token
  ON profiles (push_token) WHERE push_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_push_topics
  ON profiles USING GIN (push_topics);

COMMENT ON COLUMN profiles.push_token IS 'FCM registration token (covers both APNs via FCM and Android)';
COMMENT ON COLUMN profiles.push_platform IS 'Device platform — used for FCM payload customization';
COMMENT ON COLUMN profiles.push_topics IS 'Subscribed notification categories (server-side filter)';
```

## 2. credit_batches IAP 지원

파일: `supabase/migrations/<ts>_add_iap_support_to_credit_batches.sql`

```sql
-- 1. external_id: Stripe session ID 또는 RevenueCat transaction ID (멱등 키)
ALTER TABLE credit_batches
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_batches_external_id
  ON credit_batches (external_id) WHERE external_id IS NOT NULL;

-- 2. source: 결제 경로 분기
ALTER TABLE credit_batches
  ADD COLUMN IF NOT EXISTS source TEXT;

ALTER TABLE credit_batches
  ADD CONSTRAINT credit_batches_source_check
  CHECK (source IS NULL OR source IN ('stripe', 'iap_apple', 'iap_google', 'admin_grant', 'referral'));

CREATE INDEX IF NOT EXISTS idx_credit_batches_source
  ON credit_batches (source);

-- 3. 기존 row 백필 (Stripe로 추정)
UPDATE credit_batches SET source = 'stripe' WHERE source IS NULL;

COMMENT ON COLUMN credit_batches.external_id IS 'Idempotency key: Stripe session_id, RevenueCat transaction_id, or admin grant uuid';
COMMENT ON COLUMN credit_batches.source IS 'Payment channel: stripe, iap_apple, iap_google, admin_grant, referral';
```

## 3. add_credits RPC — external_id 처리

기존 `add_credits` 함수를 IAP 멱등성 지원으로 확장. 함수 이름 유지 + 시그니처 확장.

파일: `supabase/migrations/<ts>_update_add_credits_for_iap.sql`

```sql
-- 기존 시그니처: add_credits(user_id UUID, amount INT, source TEXT, ...)
-- 신규: external_id 옵션 + 멱등성

CREATE OR REPLACE FUNCTION add_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_source TEXT,
  p_external_id TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS BIGINT  -- 신규 batch id, 또는 -1 if 멱등 skip
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_id BIGINT;
  v_new_id BIGINT;
  v_expires TIMESTAMPTZ;
BEGIN
  -- 멱등 체크
  IF p_external_id IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM credit_batches WHERE external_id = p_external_id;
    IF v_existing_id IS NOT NULL THEN
      RETURN -1;
    END IF;
  END IF;

  -- 만료일 기본 12개월
  v_expires := COALESCE(p_expires_at, NOW() + INTERVAL '12 months');

  INSERT INTO credit_batches (user_id, total_amount, remaining_amount, source, external_id, expires_at)
  VALUES (p_user_id, p_amount, p_amount, p_source, p_external_id, v_expires)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION add_credits(UUID, INTEGER, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_credits(UUID, INTEGER, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
```

**주의**: 기존 호출처 (`/api/credits/webhook/route.ts`)는 옛 시그니처를 사용 중일 수 있다. CLAUDE.md 운영 규칙대로 마이그레이션 적용 전:

1. 현재 함수 정의 확인: `\df add_credits` (psql)
2. 기존 시그니처 보존 — 신규 함수를 `add_credits_v2`로 만들고 새 호출처만 v2 사용 (안전)
3. v1.1+에서 v1 deprecate

**v1.0 안전 패턴**:

```sql
CREATE OR REPLACE FUNCTION add_credits_iap(
  p_user_id UUID,
  p_amount INTEGER,
  p_source TEXT,
  p_external_id TEXT,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS BIGINT
...
```

호출처: `/api/credits/iap-webhook/route.ts`에서 `supabase.rpc('add_credits_iap', {...})`.

## 4. 권한 / RLS

- `profiles.push_token` UPDATE는 본인만:
  ```sql
  -- 기존 profiles 정책이 user_id == auth.uid() 패턴이면 자동 적용
  -- 다만 push_token UPDATE는 admin client 경유가 권장 (CLAUDE.md 규칙)
  ```
- `credit_batches`는 RLS 그대로 (admin client만 INSERT/UPDATE).

## 5. 적용 순서

1. profiles 푸시 필드 추가 (안전, 비파괴)
2. credit_batches external_id + source (안전, 백필 포함)
3. `add_credits_iap` 함수 추가 (신규, 기존 함수 영향 없음)
4. (v1.1) 기존 `add_credits` deprecate 및 통합

## 6. 검증 SQL

```sql
-- 컬럼 추가 확인
\d+ profiles
\d+ credit_batches

-- 멱등 테스트
SELECT add_credits_iap('00000000-0000-0000-0000-000000000001'::uuid, 500, 'iap_apple', 'TEST_TXN_001');
-- 1회: 신규 batch id
SELECT add_credits_iap('00000000-0000-0000-0000-000000000001'::uuid, 500, 'iap_apple', 'TEST_TXN_001');
-- 2회: -1 (skip)

-- 인덱스 동작 확인
EXPLAIN SELECT id FROM credit_batches WHERE external_id = 'TEST_TXN_001';
-- Index Scan on idx_credit_batches_external_id
```

## 7. 롤백 (필요 시)

```sql
DROP FUNCTION IF EXISTS add_credits_iap(UUID, INTEGER, TEXT, TEXT, TIMESTAMPTZ);

ALTER TABLE credit_batches DROP CONSTRAINT IF EXISTS credit_batches_source_check;
DROP INDEX IF EXISTS idx_credit_batches_external_id;
DROP INDEX IF EXISTS idx_credit_batches_source;
ALTER TABLE credit_batches DROP COLUMN IF EXISTS external_id;
ALTER TABLE credit_batches DROP COLUMN IF EXISTS source;

DROP INDEX IF EXISTS idx_profiles_push_token;
DROP INDEX IF EXISTS idx_profiles_push_topics;
ALTER TABLE profiles DROP COLUMN IF EXISTS push_token;
ALTER TABLE profiles DROP COLUMN IF EXISTS push_platform;
ALTER TABLE profiles DROP COLUMN IF EXISTS push_topics;
```
