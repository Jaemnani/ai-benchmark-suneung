/**
 * FCM HTTP v1 단일 SDK — iOS APNs + Android 통합 발송.
 *
 * 환경 변수:
 *   FCM_PROJECT_ID                          — Firebase 프로젝트 ID
 *   FCM_SERVICE_ACCOUNT_JSON_BASE64         — service-account-*.json을 base64 인코딩한 값
 *
 * APNs 통합:
 *   - Firebase 콘솔 → Cloud Messaging → APNs Authentication Key 업로드 (.p8 + Team ID + Key ID)
 *   - 이후 같은 FCM 토큰 / 같은 endpoint로 iOS+Android 모두 발송
 *
 * 사용처:
 *   - /api/cron/auto-news-notify  (스케줄 발송)
 *   - 트랜잭션 알림 (예: arena 결과)
 *
 * 토큰 무효화:
 *   - 응답이 404 NOT_FOUND 또는 410 GONE이면 profiles.push_token = NULL UPDATE
 */

import { GoogleAuth } from 'google-auth-library';

let cachedToken: { value: string; expiresAt: number } | null = null;

function getCredentials() {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON_BASE64;
  if (!raw) {
    throw new Error('FCM_SERVICE_ACCOUNT_JSON_BASE64 is not set');
  }
  return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as {
    client_email: string;
    private_key: string;
    project_id?: string;
  };
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const credentials = getCredentials();
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) {
    throw new Error('Failed to obtain FCM access token');
  }
  cachedToken = {
    value: tokenResponse.token,
    expiresAt: Date.now() + 50 * 60_000,
  };
  return tokenResponse.token;
}

export interface FcmPayload {
  /** FCM registration token (profiles.push_token) */
  token: string;
  title: string;
  body: string;
  /** 딥링크 path 등 추가 데이터. 모두 문자열 키-값. */
  data?: Record<string, string>;
  /** Rich notification 이미지 (옵션) */
  imageUrl?: string;
  /** iOS 깊은 분기용 */
  apnsCategory?: string;
}

export type FcmResult =
  | { ok: true }
  | { ok: false; error: string; tokenInvalid?: boolean };

export async function sendOne(payload: FcmPayload): Promise<FcmResult> {
  const projectId =
    process.env.FCM_PROJECT_ID || getCredentials().project_id;
  if (!projectId) {
    return { ok: false, error: 'FCM_PROJECT_ID is not set' };
  }
  const accessToken = await getAccessToken();
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: payload.token,
          notification: {
            title: payload.title,
            body: payload.body,
            image: payload.imageUrl,
          },
          data: payload.data ?? {},
          apns: {
            payload: {
              aps: {
                sound: 'default',
                'mutable-content': 1,
                category: payload.apnsCategory,
              },
            },
            ...(payload.imageUrl
              ? {
                  fcm_options: { image: payload.imageUrl },
                }
              : {}),
          },
          android: {
            priority: 'HIGH' as const,
            notification: {
              channel_id: 'default',
              sound: 'default',
              image: payload.imageUrl,
            },
          },
        },
      }),
    },
  );

  if (res.status === 404 || res.status === 410) {
    return { ok: false, error: 'token-invalid', tokenInvalid: true };
  }
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `${res.status} ${text}` };
  }
  return { ok: true };
}

export interface FcmBatchResult {
  /** 토큰별 성공 여부 */
  results: { token: string; result: FcmResult }[];
  /** 무효 토큰 (profiles.push_token NULL 갱신 대상) */
  invalidTokens: string[];
  /** 성공 카운트 */
  sentCount: number;
}

export async function sendMany(
  payloads: FcmPayload[],
  options: { concurrency?: number } = {},
): Promise<FcmBatchResult> {
  const concurrency = options.concurrency ?? 25;
  const results: FcmBatchResult['results'] = [];
  const invalidTokens: string[] = [];

  for (let i = 0; i < payloads.length; i += concurrency) {
    const chunk = payloads.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      chunk.map((p) => sendOne(p).then((r) => ({ token: p.token, result: r }))),
    );
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        results.push(s.value);
        if (s.value.result.ok === false && s.value.result.tokenInvalid) {
          invalidTokens.push(s.value.token);
        }
      } else {
        // promise rejection (네트워크 등): payload 토큰 매핑 불가 — 무시
      }
    }
  }

  return {
    results,
    invalidTokens,
    sentCount: results.filter((r) => r.result.ok).length,
  };
}
