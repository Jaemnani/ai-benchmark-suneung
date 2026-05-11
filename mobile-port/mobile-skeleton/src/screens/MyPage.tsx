import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '@mobile/navigation/RootStack';
import { signOut } from '@mobile/lib/auth';
import { supabase } from '@mobile/lib/supabase';
import { haptic } from '@mobile/lib/haptics';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Profile {
  id: string;
  display_name: string | null;
  push_topics: string[];
}

const TOPICS = [
  { key: 'breaking-news', label: '속보 뉴스' },
  { key: 'daily-briefing', label: '데일리 브리핑' },
  { key: 'arena-result', label: 'Arena 결과' },
];

export default function MyPage() {
  const navigation = useNavigation<Nav>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('id, display_name, push_topics')
      .eq('id', user.id)
      .single();
    if (profileRow) {
      setProfile({
        id: profileRow.id,
        display_name: profileRow.display_name,
        push_topics: profileRow.push_topics ?? [],
      });
    }
    const { data: creditsRow } = await supabase.rpc('get_user_credit_balance', {
      p_user_id: user.id,
    });
    setCredits(typeof creditsRow === 'number' ? creditsRow : null);
  }

  async function toggleTopic(topic: string, value: boolean) {
    haptic.selection();
    if (!profile) return;
    const next = value
      ? Array.from(new Set([...profile.push_topics, topic]))
      : profile.push_topics.filter((t) => t !== topic);
    setProfile({ ...profile, push_topics: next });
    await supabase.from('profiles').update({ push_topics: next }).eq('id', profile.id);
  }

  async function handleLogout() {
    Alert.alert('로그아웃', '정말 로그아웃하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>마이페이지</Text>

        <View style={styles.card}>
          <Text style={styles.label}>이름</Text>
          <Text style={styles.value}>{profile?.display_name ?? '—'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>크레딧 잔액</Text>
          <Text style={styles.valueLg}>{credits ?? '—'}</Text>
        </View>

        <Text style={styles.section}>알림 설정</Text>
        {TOPICS.map((t) => {
          const enabled = profile?.push_topics.includes(t.key) ?? false;
          return (
            <View key={t.key} style={styles.row}>
              <Text style={styles.rowText}>{t.label}</Text>
              <Switch
                value={enabled}
                onValueChange={(v) => toggleTopic(t.key, v)}
              />
            </View>
          );
        })}

        <Pressable style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa' },
  scroll: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 20 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12 },
  label: { fontSize: 12, color: '#888' },
  value: { fontSize: 18, marginTop: 4 },
  valueLg: { fontSize: 32, fontWeight: '700', marginTop: 4 },
  section: { fontSize: 14, fontWeight: '700', color: '#444', marginTop: 24, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  rowText: { fontSize: 16 },
  logoutBtn: {
    marginTop: 32,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  logoutText: { color: '#c00', fontSize: 16 },
});
