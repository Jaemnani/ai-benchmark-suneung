# 푸시 알림 — FCM 단일 SDK (iOS+Android 통합)

## 1. 전략

iOS APNs를 직접 다루지 않고 **FCM HTTP v1 단일 API**로 양 플랫폼 발송. APNs `.p8` 키만 FCM 콘솔에 업로드하면 FCM이 자동으로 APNs 게이트웨이를 거쳐 iOS 디바이스에 전달.

## 2. 발송 흐름

```
[Vercel Cron] /api/cron/auto-news-notify (매 5분)
  │
  ├─ 후보 사용자 조회: SELECT id, push_token, push_topics, push_platform FROM profiles
  │     WHERE push_token IS NOT NULL AND 'breaking-news' = ANY(push_topics)
  │
  ├─ src/lib/notification-templates.ts → 메시지 빌드
  │
  ├─ src/lib/push-fcm.ts → 토큰 배열 분할(500개씩) → FCM HTTP v1 batch
  │     POST https://fcm.googleapis.com/v1/projects/{FCM_PROJECT_ID}/messages:send
  │     Authorization: Bearer <service-account-access-token>
  │     body: { message: { token, notification: {...}, data: {...}, apns: {...}, android: {...} } }
  │
  ▼
[디바이스]
  │
  ├─ iOS: APNs → notifee/messaging이 foreground/background 분기 표시
  ├─ Android: FCM 직접 → notifee로 채널 알림 표시
  │
  ├─ 사용자 탭 → 딥링크 (data.path) → RN Linking → 네이티브 화면 또는 WebView
```

## 3. 토큰 등록 흐름

```
[mobile/src/App.tsx] 콜드 스타트 + 로그인 후
  │
  ├─ messaging().requestPermission()  // iOS는 명시 권한, Android 13+ POST_NOTIFICATIONS
  │     → user grant?
  │
  ├─ const token = await messaging().getToken()
  │
  ├─ POST /api/profile/push-token { token, platform: 'ios' | 'android' }
  │
  ▼
[src/app/api/profile/push-token/route.ts] (신규)
  │
  ├─ getServerSession() → user.id
  ├─ supabase.from('profiles').update({ push_token: token, push_platform: platform }).eq('id', user.id)
  │     (admin client — RLS 우회. CLAUDE.md 규칙)
  ├─ 200 OK
```

## 4. 신규 컬럼 (profiles)

```sql
-- supabase/migrations/<timestamp>_add_push_fields_to_profiles.sql
ALTER TABLE profiles ADD COLUMN push_token TEXT;
ALTER TABLE profiles ADD COLUMN push_platform TEXT CHECK (push_platform IN ('ios', 'android'));
ALTER TABLE profiles ADD COLUMN push_topics TEXT[] NOT NULL DEFAULT ARRAY['breaking-news', 'daily-briefing']::TEXT[];
CREATE INDEX idx_profiles_push_token ON profiles (push_token) WHERE push_token IS NOT NULL;
CREATE INDEX idx_profiles_push_topics ON profiles USING GIN (push_topics);
```

## 5. FCM Service Account

1. Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → "새 비공개 키 생성" → JSON 다운로드
2. JSON을 base64 인코딩 후 Vercel env `FCM_SERVICE_ACCOUNT_JSON_BASE64`에 저장
3. APNs `.p8` 키 (Apple Developer → Keys → "+" → APNs) → FCM 콘솔 → Cloud Messaging → APNs Authentication Key 업로드
4. Firebase `FCM_PROJECT_ID` env 추가

## 6. src/lib/push-fcm.ts (web, 신규)

```ts
import { GoogleAuth } from 'google-auth-library';

let cachedToken: { value: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now()) return cachedToken.value;
  const credentials = JSON.parse(
    Buffer.from(process.env.FCM_SERVICE_ACCOUNT_JSON_BASE64!, 'base64').toString('utf-8'),
  );
  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  cachedToken = { value: token!, exp: Date.now() + 50 * 60_000 };
  return token!;
}

export interface FcmPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

export async function sendOne(p: FcmPayload): Promise<{ ok: boolean; error?: string }> {
  const accessToken = await getAccessToken();
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: p.token,
          notification: { title: p.title, body: p.body, image: p.imageUrl },
          data: p.data ?? {},
          apns: { payload: { aps: { sound: 'default', 'mutable-content': 1 } } },
          android: { priority: 'HIGH', notification: { channel_id: 'default', sound: 'default' } },
        },
      }),
    },
  );
  if (res.status === 404 || res.status === 410) {
    // 토큰 만료 → DB에서 제거
    return { ok: false, error: 'token-invalid' };
  }
  if (!res.ok) return { ok: false, error: await res.text() };
  return { ok: true };
}

export async function sendMany(payloads: FcmPayload[]) {
  // 단일 batch endpoint는 deprecated. 동시성 50으로 처리.
  const results = await Promise.allSettled(
    payloads.map((p) => sendOne(p)),
  );
  // 토큰 무효 항목은 호출자가 profiles.push_token = null UPDATE
  return results;
}
```

## 7. 토픽 (간이)

v1.0은 클라이언트 측 토픽 구독 안 함 (FCM topic). 대신 `profiles.push_topics TEXT[]`로 서버측 필터링. 이유: 단순 + 사용자 단일 출처. 트래픽 작을 때 충분.

토픽 변경 UI: `mobile/src/screens/MyPage.tsx`의 토글 → PATCH `/api/profile/me` body `{ push_topics: [...] }`.

## 8. 토큰 무효화

- FCM `404 NOT_FOUND` 또는 `410 GONE` 응답 → `UPDATE profiles SET push_token = NULL, push_platform = NULL WHERE id = ?`
- 모바일 측: `messaging().onTokenRefresh(token => POST /api/profile/push-token)` — 토큰 회전 자동 동기화

## 9. 권한 거부 케이스

- iOS: 권한 거부 시 토큰 발급 안 됨 → 등록 안 함. MyPage에서 "알림 권한이 꺼져 있습니다 → 설정으로 이동" 버튼 (`Linking.openSettings()`).
- Android 13 미만: 자동 허가, 토큰 즉시 발급.

## 10. 신규 / 변경 파일

| 파일 | 위치 | 신규/수정 |
|---|---|---|
| `src/lib/push-fcm.ts` | web | 신규 |
| `src/app/api/profile/push-token/route.ts` | web | 신규 |
| `src/app/api/cron/auto-news-notify/route.ts` | web | 수정 (토큰 분기 발송) |
| 마이그레이션 `add_push_fields_to_profiles.sql` | web | 신규 |
| `mobile/src/lib/push.ts` | mobile | 신규 |
| `mobile/src/screens/MyPage.tsx` | mobile | 토픽 토글 UI |
| Firebase 콘솔 + APNs `.p8` | (수동) | 1회 설정 |
