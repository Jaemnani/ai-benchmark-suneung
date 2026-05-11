/**
 * Stripe(웹) ↔ RevenueCat(모바일 IAP) 상품 매핑.
 *
 * v1.0: 데모용 상품 1개만. v1.1+에서 Stripe 가격대 전체로 확장.
 */

export type IapStore = 'app_store' | 'play_store';

export interface IapProduct {
  /** RevenueCat / Apple / Google 공통 product identifier */
  sku: string;
  /** 부여 크레딧 */
  credits: number;
  /** 표시명 (RevenueCat에 등록한 reference name과 정렬) */
  displayName: string;
  /** Apple price tier (참고용) */
  applePriceTier: number;
}

export const IAP_PRODUCTS: Record<string, IapProduct> = {
  credits_starter: {
    sku: 'credits_starter',
    credits: 500,
    displayName: 'Starter Credits 500',
    applePriceTier: 1,
  },
};

export const IAP_DEMO_SKU = 'credits_starter';

export function getIapProduct(sku: string): IapProduct | null {
  return IAP_PRODUCTS[sku] ?? null;
}

export function iapStoreToSource(store: IapStore): 'iap_apple' | 'iap_google' {
  return store === 'app_store' ? 'iap_apple' : 'iap_google';
}
