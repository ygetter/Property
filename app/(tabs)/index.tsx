import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { CalendarCheck, ClipboardCheck, PoundSterling, Bell, Settings, MapPin, Clock, ArrowRight, RefreshCw, Navigation, ChevronRight } from 'lucide-react-native';
import { C } from '../../lib/theme';
import { Card, SectionTitle, Chip, Empty, Btn } from '../../components/ui';
import { store } from '../../lib/storage';
import { fetchSchedule, MondayError } from '../../lib/monday';
import { ScheduleItem, MondaySettings } from '../../lib/types';
import { todayStr, tomorrowStr, friendlyDate } from '../../lib/grouping';

function ScheduleCard({ item }: { item: ScheduleItem }) {
  const done = item.status.toLowerCase().includes('complete');
  return (
    <View style={styles.schedRow}>
      <View style={styles.schedTime}>
        <Clock size={13} color={C.sub} />
        <Text style={styles.schedTimeText}>{item.time || '—'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.schedAddr} numberOfLines={2}>{item.address}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 5 }}>
          {item.taskType ? <Chip label={item.taskType} tone="info" /> : null}
          {item.status ? <Chip label={item.status} tone={done ? 'good' : 'neutral'} /> : null}
        </View>
      </View>
    </View>
  );
}

function QuickLink({ icon, label, desc, onPress, accent }: { icon: React.ReactNode; label: string; desc: string; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quick, accent && styles.quickAccent, pressed && { opacity: 0.8 }]}>
      <View style={[styles.quickIcon, accent && styles.quickIconAccent]}>{icon}</View>
      <Text style={[styles.quickLabel, accent && { color: '#fff' }]}>{label}</Text>
      <Text style={[styles.quickDesc, accent && { color: '#F6C9A3' }]}>{desc}</Text>
    </Pressable>
  );
}

export default function Home() {
  const router = useRouter();
  const [settings, setSettings] = useState<MondaySettings | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const s = await store.getMonday();
    setSettings(s);
    setError('');
    if (!s.apiToken || !s.scheduleBoardId) return;
    setLoading(true);
    try {
      const items = await fetchSchedule(s);
      setSchedule(items.filter((i) => i.date));
    } catch (e: any) {
      setError(e instanceof MondayError ? e.message : 'Could not load schedule.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const today = todayStr();
  const tomorrow = tomorrowStr();
  const todayItems = schedule.filter((i) => i.date === today);
  const tomorrowItems = schedule.filter((i) => i.date === tomorrow);
  const configured = !!(settings?.apiToken && settings?.scheduleBoardId);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.accent} />}>
      <Text style={styles.greeting}>{greeting}.</Text>
      <Text style={styles.dateLine}>{friendlyDate(today)} · {todayItems.length} task{todayItems.length === 1 ? '' : 's'} today</Text>

      {!configured && (
        <Card style={{ borderColor: C.accent, backgroundColor: C.accentSoft }}>
          <Text style={styles.setupTitle}>Connect Monday.com to get started</Text>
          <Text style={styles.setupBody}>Add your API token and board IDs so your schedule, applicants and reports sync automatically.</Text>
          <Btn label="Open Monday.com setup" onPress={() => router.push('/settings/monday')} small icon={<Settings size={15} color="#fff" />} />
        </Card>
      )}

      {error ? (
        <Card style={{ borderColor: C.bad, backgroundColor: C.badSoft }}>
          <Text style={{ color: C.bad, fontWeight: '600', fontSize: 13 }}>{error}</Text>
          <Btn label="Retry" small kind="danger" onPress={load} icon={<RefreshCw size={14} color={C.bad} />} />
        </Card>
      ) : null}

      <SectionTitle>Today</SectionTitle>
      {todayItems.length === 0 ? (
        <Card><Empty icon={<MapPin size={26} color={C.faint} />} title={configured ? 'Nothing scheduled today' : 'Schedule not connected'} body={configured ? 'Pull down to refresh from Monday.com.' : 'Set up Monday.com in Settings.'} /></Card>
      ) : (
        <Card style={{ paddingVertical: 6, paddingHorizontal: 12 }}>
          {todayItems.map((it, i) => (
            <View key={it.id}>
              {i > 0 && <View style={styles.rowLine} />}
              <ScheduleCard item={it} />
            </View>
          ))}
        </Card>
      )}

      <SectionTitle>Tomorrow</SectionTitle>
      {tomorrowItems.length === 0 ? (
        <Card><Empty icon={<Clock size={26} color={C.faint} />} title="Nothing scheduled tomorrow" /></Card>
      ) : (
        <Card style={{ paddingVertical: 6, paddingHorizontal: 12 }}>
          {tomorrowItems.map((it, i) => (
            <View key={it.id}>
              {i > 0 && <View style={styles.rowLine} />}
              <ScheduleCard item={it} />
            </View>
          ))}
        </Card>
      )}

      {/* Free time? See which properties are close by */}
      <Pressable onPress={() => router.push('/nearby')}
        style={({ pressed }) => [styles.nearby, pressed && { opacity: 0.85 }]}>
        <View style={styles.nearbyIcon}><Navigation size={19} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nearbyTitle}>Nearby properties</Text>
          <Text style={styles.nearbyDesc}>Got a free hour? See which properties are closest to you right now.</Text>
        </View>
        <ChevronRight size={18} color={C.sub} />
      </Pressable>

      <SectionTitle>Quick links</SectionTitle>
      <View style={styles.quickGrid}>
        <QuickLink accent icon={<CalendarCheck size={20} color="#fff" />} label="Viewings" desc="Today's viewings & applicants" onPress={() => router.push('/viewings')} />
        <QuickLink icon={<ClipboardCheck size={20} color={C.accent} />} label="Inspections" desc="Routines & checklists" onPress={() => router.push('/inspections')} />
        <QuickLink icon={<PoundSterling size={20} color={C.accent} />} label="Accounts" desc="Mileage & costs" onPress={() => router.push('/accounts')} />
        <QuickLink icon={<Bell size={20} color={C.accent} />} label="Reminders" desc="Time & location alerts" onPress={() => router.push('/reminders')} />
      </View>

      <Pressable onPress={() => router.push('/settings')} style={({ pressed }) => [styles.settingsLink, pressed && { opacity: 0.7 }]}>
        <Text style={{ color: C.sub, fontWeight: '600', fontSize: 13 }}>App settings & properties</Text>
        <ArrowRight size={15} color={C.sub} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: 30, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  dateLine: { fontSize: 14, color: C.sub, marginTop: 2, marginBottom: 18, fontWeight: '500' },
  setupTitle: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 4 },
  setupBody: { fontSize: 13, color: C.sub, lineHeight: 19, marginBottom: 12 },
  schedRow: { flexDirection: 'row', gap: 12, paddingVertical: 12, alignItems: 'flex-start' },
  schedTime: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 62, paddingTop: 2 },
  schedTimeText: { fontSize: 13, fontWeight: '700', color: C.ink, fontVariant: ['tabular-nums'] },
  schedAddr: { fontSize: 14, fontWeight: '600', color: C.ink, lineHeight: 19 },
  rowLine: { height: 1, backgroundColor: C.line },
  nearby: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14, marginTop: 18 },
  nearbyIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' },
  nearbyTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
  nearbyDesc: { fontSize: 12, color: C.sub, marginTop: 2, lineHeight: 17 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quick: { width: '47%', flexGrow: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14, gap: 6 },
  quickAccent: { backgroundColor: C.navy, borderColor: C.navy },
  quickIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  quickIconAccent: { backgroundColor: C.accent },
  quickLabel: { fontSize: 15, fontWeight: '800', color: C.ink },
  quickDesc: { fontSize: 12, color: C.sub },
  settingsLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24, padding: 12 },
});
