import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { AlertTriangle, Check, RefreshCw, Users } from 'lucide-react-native';
import { C } from '../../lib/theme';
import { Card, SectionTitle, Btn, Chip } from '../../components/ui';
import { store } from '../../lib/storage';
import { MondaySettings } from '../../lib/types';
import { inspectScheduleColumns, MondayError } from '../../lib/monday';

type Col = { id: string; title: string; type: string; sample: string; names: number };

export default function MondayColumns() {
  const router = useRouter();
  const [settings, setSettings] = useState<MondaySettings | null>(null);
  const [cols, setCols] = useState<Col[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const s = await store.getMonday();
      setSettings(s);
      const res = await inspectScheduleColumns(s);
      setCols(res.columns);
    } catch (e: any) {
      setError(e instanceof MondayError ? e.message : (e?.message || 'Could not read the board.'));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const choose = async (col: Col) => {
    if (!settings) return;
    const next = { ...settings, scheduleApplicantsCol: col.id };
    await store.setMonday(next);
    setSettings(next);
    setSavedId(col.id);
  };

  const current = settings?.scheduleApplicantsCol || '';
  const withNames = cols.filter((c) => c.names > 0);
  const rest = cols.filter((c) => c.names === 0);

  return (
    <ScrollView style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Find applicants column' }} />

      <Text style={styles.lead}>
        This reads the first 25 rows of your schedule board and shows what every column actually contains.
        Find the one holding your applicant names and tap “Use this one”.
      </Text>

      {busy && (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={C.accent} />
            <Text style={styles.muted}>Reading your board…</Text>
          </View>
        </Card>
      )}

      {error ? (
        <Card style={{ borderColor: C.bad, backgroundColor: C.badSoft }}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <AlertTriangle size={16} color={C.bad} />
            <Text style={styles.errText}>{error}</Text>
          </View>
          <Btn label="Try again" small kind="danger" onPress={load} icon={<RefreshCw size={14} color={C.bad} />} />
        </Card>
      ) : null}

      {!busy && !error && (
        <>
          {withNames.length > 0 && (
            <>
              <SectionTitle>Columns with names in them</SectionTitle>
              {withNames.map((c) => (
                <ColRow key={c.id} col={c} isCurrent={c.id === current} justSaved={savedId === c.id} onChoose={() => choose(c)} recommended />
              ))}
            </>
          )}

          <SectionTitle>{withNames.length > 0 ? 'Other columns' : 'All columns on the board'}</SectionTitle>
          {rest.map((c) => (
            <ColRow key={c.id} col={c} isCurrent={c.id === current} justSaved={savedId === c.id} onChoose={() => choose(c)} />
          ))}

          {withNames.length === 0 && (
            <Card style={{ marginTop: 12, backgroundColor: C.accentSoft, borderColor: C.accent }}>
              <Text style={styles.tipTitle}>No names found in any column</Text>
              <Text style={styles.muted}>
                That usually means the applicants are linked from the applicants board side only (a one-way
                “connect boards” column). The app now checks that direction automatically as well — go back to
                Viewings and pull down to refresh. If it is still empty, make sure the connect column on the
                applicants board points at this schedule board.
              </Text>
            </Card>
          )}

          <View style={{ marginTop: 16 }}>
            <Btn label="Back to viewings" kind="primary" icon={<Users size={15} color="#fff" />}
              onPress={() => router.push('/viewings')} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function ColRow({ col, isCurrent, justSaved, onChoose, recommended }:
  { col: Col; isCurrent: boolean; justSaved: boolean; onChoose: () => void; recommended?: boolean }) {
  return (
    <View style={[styles.row, recommended && styles.rowRec]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{col.title}</Text>
        <View style={styles.chips}>
          <Chip label={col.type} tone="info" />
          <Chip label={col.id} tone="neutral" />
          {col.names > 0 ? <Chip label={`${col.names} names`} tone="good" /> : null}
          {isCurrent ? <Chip label="In use" tone="accent" /> : null}
        </View>
        <Text style={styles.sample} numberOfLines={2}>
          {col.sample ? col.sample : 'Empty on the rows checked'}
        </Text>
      </View>
      <Pressable onPress={onChoose} style={({ pressed }) => [styles.use, pressed && { opacity: 0.7 }]}>
        {justSaved ? <Check size={14} color={C.good} /> : null}
        <Text style={[styles.useText, justSaved && { color: C.good }]}>
          {justSaved ? 'Saved' : 'Use this one'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 13, color: C.sub, lineHeight: 19, marginBottom: 14 },
  muted: { fontSize: 12.5, color: C.sub, lineHeight: 18 },
  errText: { color: C.bad, fontWeight: '600', fontSize: 13, lineHeight: 19, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 10 },
  rowRec: { borderColor: C.accent },
  title: { fontSize: 14.5, fontWeight: '700', color: C.ink },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6 },
  sample: { fontSize: 12, color: C.sub, marginTop: 8, lineHeight: 17 },
  use: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: C.bg },
  useText: { fontSize: 12.5, fontWeight: '700', color: C.accent },
  tipTitle: { fontSize: 14, fontWeight: '800', color: C.ink, marginBottom: 6 },
});
