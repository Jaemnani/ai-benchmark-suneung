import React from 'react';
import {
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '@mobile/navigation/RootStack';
import { haptic } from '@mobile/lib/haptics';
import { withLocalePrefix } from '@mobile/lib/locale';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CARDS = [
  { path: '/news', title: '뉴스', subtitle: 'AI가 큐레이팅한 오늘의 이슈' },
  { path: '/askai', title: 'AskAI', subtitle: '질문하고 답을 받으세요' },
  { path: '/arena', title: 'Arena', subtitle: 'AI 모델 토너먼트' },
  { path: '/class', title: '클래스', subtitle: '커리큘럼 + 실습' },
  { path: '/workshop', title: '워크숍', subtitle: '오프라인 모임' },
  { path: '/benchmarks', title: '벤치마크', subtitle: '모델 비교' },
];

export default function Home() {
  const navigation = useNavigation<Nav>();
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.greeting}>안녕하세요 👋</Text>
        <Text style={styles.sub}>오늘 뭘 해볼까요?</Text>
        <View style={styles.grid}>
          {CARDS.map((c) => (
            <Pressable
              key={c.path}
              style={styles.card}
              onPress={() => {
                haptic.light();
                navigation.navigate('WebViewScreen', { path: withLocalePrefix(c.path) });
              }}
            >
              <Text style={styles.cardTitle}>{c.title}</Text>
              <Text style={styles.cardSub}>{c.subtitle}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa' },
  scroll: { padding: 20, paddingBottom: 40 },
  greeting: { fontSize: 32, fontWeight: '800' },
  sub: { fontSize: 16, color: '#666', marginTop: 4, marginBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '48%',
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  cardSub: { fontSize: 12, color: '#777', marginTop: 4 },
});
