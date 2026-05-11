# IAP 흐름 — RevenueCat 데모 상품 1개

## 1. 범위 (v1.0)

- **상품 1개**: `credits_starter` (Apple Tier 1 ~ $0.99 / ₩1,500 / ¥160)
- **부여 크레딧**: 500 (Stripe Starter pack과 동일 단가 매칭)
- **목적**: Apple Guideline 4.2 / 3.1.1 통과 + 결제 파이프라인 end-to-end 검증
- **v1.1+**: Stripe 가격대 전체를 IAP로 확장

## 2. 결제 흐름

```
[mobile/src/screens/Plans.tsx]
  │
  ├─ 사용자 Login 직후 RevenueCat 초기화 (Supabase user.id로 appUserID 설정)
  │     Purchases.configure({ apiKey, appUserID: supabaseUser.id })
  │
  ├─ Plans 화면 진입 시 상품 1개 표시
  │     const products = await Purchases.getProducts(['credits_starter'])
  │
  ├─ "구매" 버튼 클릭
  │     const { customerInfo } = await Purchases.purchaseStoreProduct(products[0])
  │
  ▼
[App Store / Play Store 결제 시트]
  │
  ├─ 사용자 인증 + 결제 완료
  ▼
[RevenueCat 백엔드]
  │
  ├─ 영수증 자동 검증 (Apple/Google API)
  ├─ Webhook POST → https://www.aib.vote/api/credits/iap-webhook
  │     headers: { Authorization: "Bearer <REVENUECAT_WEBHOOK_SECRET>" }
  │     body: { event: { type: 'INITIAL_PURCHASE', app_user_id, product_id, transaction_id, store: 'APP_STORE' | 'PLAY_STORE', ... } }
  │
  ▼
[/api/credits/iap-webhook]
  │
  ├─ 1. Authorization 검증 (== process.env.REVENUECAT_WEBHOOK_SECRET)
  ├─ 2. 멱등 체크: SELECT id FROM credit_batches WHERE external_id = transaction_id
  │      이미 있으면 200 OK 즉시 리턴
  ├─ 3. source 결정: 'iap_apple' if store=='APP_STORE' else 'iap_google'
  ├─ 4. supabase.rpc('add_credits', { user_id: app_user_id, amount: 500, source, external_id: transaction_id, expires_at: NOW()+'12 months' })
  ├─ 5. 200 OK
  │
  ▼
[모바일 측]
  │
  ├─ Purchases.purchaseStoreProduct() 가 resolve 되면 RN이 /api/credits/balance 폴링 또는
  │   RevenueCat customerInfo 변경 listener로 UI 갱신
  ▼
사용자 마이페이지에 크레딧 +500 표시
```

## 3. RevenueCat 콘솔 설정

1. https://app.revenuecat.com → 새 프로젝트 "aib"
2. iOS 앱 등록 — Bundle ID `vote.aib.app`, App Store Connect 키 업로드
3. Android 앱 등록 — applicationId `vote.aib.app`, Play Console service account JSON 업로드
4. Products → **Add product**:
   - Identifier: `credits_starter`
   - Type: Non-consumable? **NO — consumable** (반복 구매 가능, 크레딧 누적)
   - Display name: "스타터 크레딧 500"
5. Entitlements → **Add entitlement**: `credits.starter` (이걸로 webhook 분기 — 단일 상품이라 사실상 불필요하지만 v1.1 확장 대비)
6. Offerings → "default" → package "starter" → product = `credits_starter`
7. Integrations → Webhooks → URL = `https://www.aib.vote/api/credits/iap-webhook`, secret 생성 → `.env` 의 `REVENUECAT_WEBHOOK_SECRET`

## 4. App Store / Play Store 상품 등록

### Apple
1. App Store Connect → 앱 → "In-App Purchases" → "+"
2. Type: **Consumable**
3. Product ID: `credits_starter` (RevenueCat ID와 일치)
4. Reference name: "Starter Credits 500"
5. Price tier: Tier 1
6. 로컬라이제이션: ko/ja/en 모두 입력
7. Review screenshot (1024x1024) + review note
8. **Submit for review** (앱 심사와 동시 진행 가능)

### Google Play
1. Play Console → 앱 → "Monetize" → "Products" → "In-app products"
2. Product ID: `credits_starter`
3. Type: Managed product (consumable)
4. Default price: $0.99 (Apple과 매칭, locale별 자동 변환)
5. Active 토글

## 5. 가격 매핑 SSOT

`src/lib/pricing-iap.ts` (web):

```ts
export const IAP_PRODUCTS = {
  credits_starter: { credits: 500, displayName: 'Starter Credits 500' },
} as const;
export type IapProductId = keyof typeof IAP_PRODUCTS;
export const IAP_DEMO_SKU: IapProductId = 'credits_starter';
```

웹 결제 (Stripe Starter pack)도 같은 500 크레딧이라 ledger 일관성 유지.

## 6. 멱등성

- `credit_batches.external_id` 컬럼 (UNIQUE 인덱스) — Stripe session ID와 RevenueCat transaction ID 둘 다 들어감
- 같은 transaction_id로 webhook이 두 번 와도 두 번째는 skip
- 환불 (REFUND, CANCELLATION 이벤트) — v1.1에서 처리. v1.0은 INITIAL_PURCHASE만.

## 7. Stripe vs IAP 가드

- 웹 plans 페이지: `if (isNative()) { 'use IAP' 메시지 + 닫기 버튼 }` — WebView가 어쩌다 plans 진입했을 때 안전망. 정상 흐름은 RN 라우터가 native Plans로 라우트.
- `/api/credits/checkout/route.ts`: User-Agent에 `AIB-Native` 시그니처가 있으면 400 + "Use in-app purchase on mobile" 응답. mobile WebView 측은 UA 헤더에 시그니처 부착.

## 8. 검증 시나리오 (Phase 5)

- [ ] iOS Sandbox 계정 + StoreKit testing → Plans.tsx 진입 → 구매 → RevenueCat 콘솔 거래 표시 → webhook 200 → Supabase Studio에서 credit_batches INSERT 확인
- [ ] Android License tester → Play Console internal testing track → 동일 시나리오
- [ ] 중복 webhook (RevenueCat이 retry) → 두 번째 INSERT가 멱등 스킵 (500 status 아닌 200 — RevenueCat retry 폭주 방지)
- [ ] 결제 취소 / 결제 실패 → credit_batches 변동 없음
- [ ] 사용자가 한 디바이스에서 구매 → 다른 디바이스 로그인 시 크레딧 보임 (Supabase 동기화)

## 9. Apple 4.2 / 3.1.1 통과 포인트

- 외부 결제 링크 0개 (iOS): plans, mypage, 어디서도 "Stripe로 결제" / "웹에서 결제" 류 버튼 / 텍스트 노출 금지
- Android: User Choice Billing 허용되지만 v1.0은 일관성을 위해 IAP 전용
- WebView 안에 Stripe Checkout URL이 절대 로드되지 않도록 navigation 가드: `onShouldStartLoadWithRequest`에서 `stripe.com`, `*.stripe.com` 차단

## 10. 신규 / 변경 파일

| 파일 | 위치 | 신규/수정 |
|---|---|---|
| `src/lib/pricing-iap.ts` | web | 신규 |
| `src/app/api/credits/iap-webhook/route.ts` | web | 신규 |
| `src/app/api/credits/checkout/route.ts` | web | 수정 (UA 가드 추가) |
| 마이그레이션 `add_external_id_to_credit_batches.sql` | web | 신규 |
| `mobile/src/screens/Plans.tsx` | mobile | 신규 |
| `mobile/src/lib/iap.ts` | mobile | 신규 |
| RevenueCat 콘솔 | (수동) | 상품 + 웹훅 |
| App Store Connect / Play Console | (수동) | IAP 등록 |
