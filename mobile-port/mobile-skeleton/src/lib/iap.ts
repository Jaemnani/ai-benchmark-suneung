import { Platform } from 'react-native';
import Purchases, {
  type PurchasesStoreProduct,
} from 'react-native-purchases';

import { ENV } from '@mobile/env';

export const STARTER_SKU = 'credits_starter';

let initialized = false;

export async function initIAP(supabaseUserId: string) {
  if (initialized) {
    await Purchases.logIn(supabaseUserId);
    return;
  }
  const apiKey =
    Platform.OS === 'ios' ? ENV.RC_API_KEY_IOS : ENV.RC_API_KEY_ANDROID;
  await Purchases.configure({ apiKey, appUserID: supabaseUserId });
  Purchases.setLogLevel(Purchases.LOG_LEVEL.WARN);
  initialized = true;
}

export async function getStarterProduct(): Promise<PurchasesStoreProduct | null> {
  const products = await Purchases.getProducts([STARTER_SKU]);
  return products[0] ?? null;
}

export async function purchaseStarter() {
  const product = await getStarterProduct();
  if (!product) throw new Error(`Product not found: ${STARTER_SKU}`);
  const { customerInfo, transactionIdentifier } =
    await Purchases.purchaseStoreProduct(product);
  return { customerInfo, transactionIdentifier };
}

export async function restorePurchases() {
  return Purchases.restorePurchases();
}
