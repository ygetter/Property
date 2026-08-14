import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, Circle, Star, Save } from 'lucide-react-native';
import { C } from '../../lib/theme';
import { Card, Input, Chip, Btn } from '../../components/ui';
import { store, uid } from '../../lib/storage';
import { Property, InspectionRoutine, InspectionRecord, InspectionAnswer } from '../../lib/types';
import { buildQuestionnaire, scopeLabel } from '../../lib/inspections';

export default function RunInspection() {
  const { propertyId, routineId } = useLocalSearchParams<{ propertyId: string; routineId: string }>();
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [routine, setRoutine] = useState<InspectionRoutine | null>(null);
  const [answers, setAnswers] = useState<InspectionAnswer[]>([]);
  const [recordId, setRecordId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const props = await store.getProperties();
      const routines = await store.getRoutines();
      const p = props.find((x) => x.id === propertyId) || null;
      const r = routines.find((x) => x.id === routineId) || null;
      setProperty(p);
      setRoutine(r);
      if (p && r) {
        setAnswers(buildQuestionnaire(p, r));
        setRecordId(uid());
      }
    })();
  }, [propertyId, routineId]);

  const grouped = useMemo(() => {
    const map = new Map<string, InspectionAnswer[]>();
    for (const a of answers) {
      const arr = map.get(a.targetLabel) || [];
      arr.push(a);
      map.set(a.targetLabel, arr);
    }
    return [...map.entries()];
  }, [answers]);

  const setValue = (idx: number, value: string) => {
    setAnswers((prev) => prev.map((a, i) => (i === idx ? { ...a, value } : a)));
  };

  const answered = answers.filter((a) => a.value).length;
  const progress = answers.length ? answered / answers.length : 0;

  const save = async (complete: boolean) => {
    if (!property || !routine) return;
    setSaving(true);
    try {
      const records = await store.getInspections();
      const rec: InspectionRecord = {
        id: recordId,
        propertyId: property.id,
        propertyAddress: property.address,
        routineName: routine.name,
        startedAt: Date.now(),
        completedAt: complete ? Date.now() : null,
        answers,
        uploaded: false,
      };
      const existing = records.findIndex((r) => r.id === recordId);
      if (existing >= 0) records[existing] = rec; else records.push(rec);
      await store.setInspections(records);
      Alert.alert(
        complete ? 'Inspection saved' : 'Progress saved',
        complete
          ? 'Saved on this device. You can set a reminder to upload it to your custom software from the Reminders tab.'
          : 'You can come back and finish later.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } finally {
      setSaving(false);
    }
  };

  if (!property || !routine) {
    return (
      <View style={styles.center}>
        <Text style={{ color: C.sub }}>Loading…</Text>
      </View>
    );
  }

  let flatIndex = -1;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Text style={styles.h1}>{property.address}</Text>
      <Text style={styles.h2}>{routine.name} · {answered}/{answers.length} answered</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>

      {grouped.map(([target, list]) => (
        <View key={target}>
          <Text style={styles.targetTitle}>{target}</Text>
          <Card>
            {list.map((a) => {
              flatIndex = answers.indexOf(a);
              const idx = flatIndex;
              return (
                <View key={a.questionId + idx} style={styles.qRow}>
                  <Text style={styles.qText}>{a.questionText || '(untitled question)'}</Text>
                  <Text style={styles.qScope}>{scopeLabel(a.scope)}</Text>

                  {a.answerType === 'text' && (
                    <Input placeholder="Type answer…" value={a.value} onChangeText={(t) => setValue(idx, t)} multiline />
                  )}
                  {a.answerType === 'number' && (
                    <Input placeholder="0" value={a.value} onChangeText={(t) => setValue(idx, t)} keyboardType="numeric" />
                  )}
                  {a.answerType === 'yesno' && (
                    <View style={styles.rowBtns}>
                      {['Yes', 'No', 'N/A'].map((v) => (
                        <Pressable key={v} onPress={() => setValue(idx, v)} style={[styles.pill, a.value === v && styles.pillActive]}>
                          <Text style={[styles.pillText, a.value === v && { color: '#fff' }]}>{v}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {a.answerType === 'multi' && (
                    <View style={styles.rowBtns}>
                      {(a.options || []).map((v) => (
                        <Pressable key={v} onPress={() => setValue(idx, v)} style={[styles.pill, a.value === v && styles.pillActive]}>
                          <Text style={[styles.pillText, a.value === v && { color: '#fff' }]}>{v}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {a.answerType === 'rating' && (
                    <View style={styles.rowBtns}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Pressable key={n} onPress={() => setValue(idx, String(n))} style={styles.starBtn}>
                          <Star size={26} color={Number(a.value) >= n ? C.accent : C.line} fill={Number(a.value) >= n ? C.accent : 'transparent'} />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        </View>
      ))}

      <View style={{ gap: 10, marginTop: 8 }}>
        <Btn label="Save & complete inspection" loading={saving} onPress={() => save(true)} icon={<CheckCircle2 size={16} color="#fff" />} />
        <Btn label="Save progress & exit" kind="ghost" onPress={() => save(false)} icon={<Save size={15} color={C.ink} />} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 22, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  h2: { fontSize: 13, color: C.sub, marginTop: 3, marginBottom: 10, fontWeight: '500' },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: C.accent },
  targetTitle: { fontSize: 13, fontWeight: '800', color: C.navy, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  qRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  qText: { fontSize: 14.5, fontWeight: '600', color: C.ink, lineHeight: 20 },
  qScope: { fontSize: 11, color: C.faint, marginTop: 2, marginBottom: 8 },
  rowBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderWidth: 1, borderColor: C.line, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#fff' },
  pillActive: { backgroundColor: C.accent, borderColor: C.accent },
  pillText: { fontSize: 13.5, fontWeight: '700', color: C.ink },
  starBtn: { padding: 2 },
});
