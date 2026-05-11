/**
 * POST /api/profile/push-token
 *
 * 모바일 앱이 FCM 토큰을 등록/갱신한다.
 *
 * 요청: { token: string, platform: 'ios' | 'android' }
 * 응답: 204 No Content (성공) / 4xx (인증 실패 / payload 검증 실패)
 *
 * 규칙:
 *   - 인증된 사용자만 (Supabase 쿠키 세션 — 모바일은 native-bridge로 세션 주입한 상태)
 *   - profiles.push_token UPDATE는 admin client 경유 (CLAUDE.md 규칙)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface Body {
  token?: unknown;
  platform?: unknown;
}

function parseBody(b: Body): { token: string; platform: 'ios' | 'android' } | null {
  if (typeof b.token !== 'string' || b.token.length < 10 || b.token.length > 4096) {
    return null;
  }
  if (b.platform !== 'ios' && b.platform !== 'android') {
    return null;
  }
  return { token: b.token, platform: b.platform };
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = parseBody(body);
  if (!parsed) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from('profiles')
    .update({
      push_token: parsed.token,
      push_platform: parsed.platform,
    })
    .eq('id', user.id);

  if (updateError) {
    console.error('[push-token] update failed', { userId: user.id, updateError });
    return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}

/**
 * DELETE /api/profile/push-token — 토큰 제거 (로그아웃 또는 알림 끄기)
 */
export async function DELETE() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  await admin
    .from('profiles')
    .update({ push_token: null, push_platform: null })
    .eq('id', user.id);
  return new NextResponse(null, { status: 204 });
}
