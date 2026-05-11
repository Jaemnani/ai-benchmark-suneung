/**
 * POST /api/credits/iap-webhook
 *
 * RevenueCat Webhook 수신 — Apple/Google IAP 영수증이 RevenueCat에서 검증된 후 호출.
 *
 * 인증: Authorization 헤더가 process.env.REVENUECAT_WEBHOOK_SECRET와 정확히 일치해야 함.
 *
 * 멱등성: credit_batches.external_id == event.transaction_id로 중복 처리 방지.
 *   - 신규 INSERT 시 add_credits_iap RPC가 -1을 반환하면 이미 처리된 거래 → 200 OK 즉시 응답.
 *
 * v1.0 범위: INITIAL_PURCHASE / NON_RENEWING_PURCHASE만 처리.
 *   RENEWAL / CANCELLATION / REFUND 등은 v1.1+에서 추가.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { IAP_PRODUCTS, iapStoreToSource, type IapStore } from '@/lib/pricing-iap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RevenueCatEvent {
  event: {
    type: string;
    app_user_id: string;
    product_id: string;
    transaction_id: string;
    /** 'APP_STORE' | 'PLAY_STORE' | 'STRIPE' | 'PROMOTIONAL' */
    store: string;
    /** ISO timestamp */
    purchased_at_ms?: number;
    environment?: 'SANDBOX' | 'PRODUCTION';
    [k: string]: unknown;
  };
  api_version: string;
}

const ACCEPTED_TYPES = new Set(['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE']);
const ACCEPTED_STORES: Record<string, IapStore> = {
  APP_STORE: 'app_store',
  PLAY_STORE: 'play_store',
};

export async function POST(req: NextRequest) {
  // 1. 인증
  const auth = req.headers.get('authorization');
  const expected = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!expected) {
    console.error('[iap-webhook] REVENUECAT_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. payload 파싱
  let payload: RevenueCatEvent;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const ev = payload.event;
  if (!ev || typeof ev.type !== 'string') {
    return NextResponse.json({ error: 'invalid_event' }, { status: 400 });
  }

  // 3. 미지원 type — 200 OK로 응답 (RevenueCat retry 폭주 방지)
  if (!ACCEPTED_TYPES.has(ev.type)) {
    return NextResponse.json({ ok: true, skipped: 'unsupported_type' });
  }

  // 4. 미지원 store
  const store = ACCEPTED_STORES[ev.store];
  if (!store) {
    return NextResponse.json({ ok: true, skipped: 'unsupported_store' });
  }

  // 5. 상품 매핑
  const product = IAP_PRODUCTS[ev.product_id];
  if (!product) {
    console.warn('[iap-webhook] unknown product_id', { productId: ev.product_id });
    return NextResponse.json({ ok: true, skipped: 'unknown_product' });
  }

  // 6. user_id 검증 (UUID 형태)
  if (
    typeof ev.app_user_id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ev.app_user_id)
  ) {
    console.warn('[iap-webhook] invalid app_user_id', { appUserId: ev.app_user_id });
    return NextResponse.json({ error: 'invalid_user_id' }, { status: 400 });
  }

  // 7. transaction_id 검증
  if (typeof ev.transaction_id !== 'string' || ev.transaction_id.length === 0) {
    return NextResponse.json({ error: 'invalid_transaction_id' }, { status: 400 });
  }

  // 8. 크레딧 부여 — 멱등 함수 호출
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('add_credits_iap', {
    p_user_id: ev.app_user_id,
    p_amount: product.credits,
    p_source: iapStoreToSource(store),
    p_external_id: ev.transaction_id,
    p_expires_at: null, // 기본 12개월 (RPC default)
  });

  if (error) {
    console.error('[iap-webhook] add_credits_iap RPC failed', { error, transactionId: ev.transaction_id });
    return NextResponse.json({ error: 'rpc_failed' }, { status: 500 });
  }

  // 9. data === -1 이면 멱등 skip (이미 처리됨)
  if (data === -1) {
    return NextResponse.json({ ok: true, skipped: 'idempotent' });
  }

  console.log('[iap-webhook] credits granted', {
    userId: ev.app_user_id,
    productId: ev.product_id,
    credits: product.credits,
    batchId: data,
    transactionId: ev.transaction_id,
    environment: ev.environment,
  });
  return NextResponse.json({ ok: true, batch_id: data });
}
