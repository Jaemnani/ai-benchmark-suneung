import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { STARTER_SKU, getStarterProduct, purchaseStarter } from '@mobile/lib/iap';
import { haptic } from '@mobile/lib/haptics';

interface ProductSummary {
  priceString: string;
  title: string;
  description: string;
}

export default function Plans() {
  const [product, setProduct] = useState<ProductSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await getStarterProduct();
        if (!p) {
          setError(`상품을 불러오지 못했습니다 (${STARTER_SKU})`);
          return;
        }
        setProduct({
          priceString: p.priceString,
          title: p.title ?? '스타터 크레딧 500',
          description: p.description ?? '500 크레딧',
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : '상품 로딩 실패');
      }
    })();
  }, []);

  async function handlePurchase() {
    setBusy(true);
    try {
      await purchaseStarter();
      haptic.success();
      Alert.alert(
        '구매 완료',
        '크레딧이 추가되었습니다. 마이페이지에서 확인하세요.',
      );
    } catch (e) {
      haptic.error();
      const message = e instanceof Error ? e.message : '구매 실패';
      // 사용자 취소는 RevenueCat이 `userCancelled` 플래그로 반환 — 알림 생략
      if (!message.toLowerCase().includes('cancelled')) {
        Alert.alert('구매 실패', message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.body}>
        <Text style={styles.title}>크레딧 충전</Text>
        <Text style={styles.intro}>
          AI 답변, Arena, 클래스 등 모든 기능에서 사용할 수 있는 공용 크레딧입니다.
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}

        {product ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{product.title}</Text>
            <Text style={styles.cardSub}>{product.description}</Text>
            <Text style={styles.cardPrice}>{product.priceString}</Text>
            <Pressable
              style={styles.buyBtn}
              onPress={handlePurchase}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buyText}>구매하기</Text>
              )}
            </Pressable>
          </View>
        ) : !error ? (
          <ActivityIndicator />
        ) : null}

        <Text style={styles.legal}>
          결제는 Apple/Google 계정으로 처리되며, 환불은 각 스토어 정책을 따릅니다.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa' },
  body: { padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '800' },
  intro: { fontSize: 15, color: '#555', lineHeight: 22 },
  error: { color: '#c00', marginVertical: 12 },
  card: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  cardTitle: { fontSize: 20, fontWeight: '700' },
  cardSub: { fontSize: 14, color: '#777', marginTop: 4 },
  cardPrice: { fontSize: 32, fontWeight: '800', marginTop: 16 },
  buyBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  buyText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  legal: { fontSize: 12, color: '#999', marginTop: 24, lineHeight: 18 },
});
