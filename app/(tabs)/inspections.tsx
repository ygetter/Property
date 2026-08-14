import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ClipboardCheck, Plus, Trash2, Play, ChevronDown, ChevronUp, Search, History, X } from 'lucide-react-native';
import { C } from '../../lib/theme';
import { Card, SectionTitle, Input, Chip, Btn, Empty, Divider } from '../../components/ui';
import { store, uid } from '../../lib/storage';
import { Property, InspectionRoutine, InspectionQuestion, AnswerType, QuestionScope, InspectionRecord } from '../../lib/types';
import { scopeLabel, answerTypeLabel } from '../../lib/inspections';

const ANSWER_TYPES: AnswerType[] = ['text', 'yesno', 'multi', 'number', 'rating'];
const SCOPES: QuestionScope[] = ['property', 'exterior', 'unit', 'bedroom', 'kitchen', 'bathroom', 'communal'];

export default function Inspections() {
  const router = useRouter();
  const [routines, setRoutines] = useState<InspectionRoutine[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [routinePickerFor, setRoutinePickerFor] = useState<Property | null>(null);

  const load = useCallback(async () => {
    setRoutines(await store.getRoutines());
    setProperties(await store.getProperties());
    setRecords((await store.getInspections()).slice(-5).reverse());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const persist = async (next: InspectionRoutine[]) => {
    setRoutines(next);
    await store.setRoutines(next);
  };

  const addRoutine = () => {
    const r: InspectionRoutine = { id: uid(), name: `Routine ${routines.length + 1}`, questions: [], updatedAt: Date.now() };
    persist([...routines, r]);
    setEditingId(r.id);
  };

  const updateRoutine = (id: string, patch: Partial<InspectionRoutine>) => {
    persist(routines.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r)));
  };

  const deleteRoutine = (id: string) => {
    const doDelete = () => persist(routines.filter((r) => r.id !== id));
    Alert.alert('Delete routine?', 'This removes the routine and all its questions.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  };

  const addQuestion = (routineId: string) => {
    const r = routines.find((x) => x.id === routineId);
    if (!r) return;
    const q: InspectionQuestion = { id: uid(), text: '', answerType: 'text', options: [], scope: 'unit' };
    updateRoutine(routineId, { questions: [...r.questions, q] });
  };

  const updateQuestion = (routineId: string, qid: string, patch: Partial<InspectionQuestion>) => {
    const r = routines.find((x) => x.id === routineId);
    if (!r) return;
    updateRoutine(routineId, { questions: r.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)) });
  };

  const removeQuestion = (routineId: string, qid: string) => {
    const r = routines.find((x) => x.id === routineId);
    if (!r) return;
    updateRoutine(routineId, { questions: r.questions.filter((q) => q.id !== qid) });
  };

  const searchResults = search.trim().length >= 2
    ? properties.filter((p) => (p.address + ' ' + p.postcode).toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : [];

  const startInspection = (p: Property, routineId: string) => {
    router.push({ pathname: '/inspection/run', params: { propertyId: p.id, routineId } });
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">

      {/* Start an inspection */}
      <SectionTitle>Start an inspection</SectionTitle>
      <Card>
        <View style={styles.searchRow}>
          <Search size={17} color={C.faint} />
          <Input style={styles.searchInput} placeholder="Search saved properties…" value={search} onChangeText={setSearch} autoCapitalize="none" />
          {search ? <Pressable onPress={() => setSearch('')} hitSlop={8}><X size={15} color={C.faint} /></Pressable> : null}
        </View>
        {searchResults.map((p) => (
          <View key={p.id} style={styles.propRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.propAddr}>{p.address}</Text>
              <Text style={styles.propMeta}>{p.type}{p.units.length ? ` · ${p.units.length} unit${p.units.length === 1 ? '' : 's'}` : ''}</Text>
            </View>
            <Btn label="Start" small onPress={() => setRoutinePickerFor(p)} icon={<Play size={13} color="#fff" />} />
          </View>
        ))}
        {search.length >= 2 && searchResults.length === 0 && (
          <Text style={styles.hint}>No saved property matches. Add properties in Settings → Properties.</Text>
        )}
        {search.length < 2 && <Text style={styles.hint}>Type at least 2 characters. Properties are managed in Settings.</Text>}
      </Card>

      {/* Routine picker */}
      {routinePickerFor && (
        <Card style={{ borderColor: C.accent }}>
          <Text style={styles.pickTitle}>Choose a routine for</Text>
          <Text style={styles.pickAddr}>{routinePickerFor.address}</Text>
          <View style={{ gap: 8, marginTop: 12 }}>
            {routines.map((r) => (
              <Pressable key={r.id} onPress={() => { const p = routinePickerFor; setRoutinePickerFor(null); startInspection(p, r.id); }}
                style={({ pressed }) => [styles.routinePick, pressed && { opacity: 0.7 }]}>
                <ClipboardCheck size={16} color={C.accent} />
                <Text style={styles.routinePickText}>{r.name}</Text>
                <Chip label={`${r.questions.length} questions`} tone="neutral" />
              </Pressable>
            ))}
            {routines.length === 0 && <Text style={styles.hint}>No routines yet — build one below first.</Text>}
            <Btn label="Cancel" kind="ghost" small onPress={() => setRoutinePickerFor(null)} />
          </View>
        </Card>
      )}

      {/* Routines */}
      <SectionTitle right={<Btn label="New routine" small kind="soft" onPress={addRoutine} icon={<Plus size={14} color={C.accent} />} />}>
        Inspection routines
      </SectionTitle>

      {routines.length === 0 && (
        <Card>
          <Empty icon={<ClipboardCheck size={26} color={C.faint} />} title="No routines yet"
            body="Build a reusable checklist — e.g. 'HMO quarterly inspection' — with questions scoped to rooms, kitchens, bathrooms or the whole property." />
        </Card>
      )}

      {routines.map((r) => {
        const open = editingId === r.id;
        return (
          <Card key={r.id}>
            <View style={styles.routineHead}>
              {open ? (
                <Input style={styles.routineNameInput} value={r.name} onChangeText={(t) => updateRoutine(r.id, { name: t })} />
              ) : (
                <Text style={styles.routineName}>{r.name}</Text>
              )}
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Chip label={`${r.questions.length}q`} tone="neutral" />
                <Pressable onPress={() => deleteRoutine(r.id)} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.5 }}>
                  <Trash2 size={16} color={C.bad} />
                </Pressable>
                <Pressable onPress={() => setEditingId(open ? null : r.id)} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.5 }}>
                  {open ? <ChevronUp size={18} color={C.sub} /> : <ChevronDown size={18} color={C.sub} />}
                </Pressable>
              </View>
            </View>

            {open && (
              <View style={{ marginTop: 12 }}>
                {r.questions.map((q, qi) => (
                  <View key={q.id} style={styles.qBlock}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.qNum}>Q{qi + 1}</Text>
                      <Pressable onPress={() => removeQuestion(r.id, q.id)} hitSlop={8} style={({ pressed }) => [{ marginLeft: 'auto' }, pressed && { opacity: 0.5 }]}>
                        <Trash2 size={14} color={C.faint} />
                      </Pressable>
                    </View>
                    <Input placeholder="Question — e.g. Any signs of damp or mould?" value={q.text} onChangeText={(t) => updateQuestion(r.id, q.id, { text: t })} />
                    <Text style={styles.qLabel}>Answer type</Text>
                    <View style={styles.optRow}>
                      {ANSWER_TYPES.map((t) => (
                        <Pressable key={t} onPress={() => updateQuestion(r.id, q.id, { answerType: t })}
                          style={[styles.optBtn, q.answerType === t && styles.optBtnActive]}>
                          <Text style={[styles.optText, q.answerType === t && { color: '#fff' }]}>{answerTypeLabel(t)}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {q.answerType === 'multi' && (
                      <Input placeholder="Choices, comma separated — e.g. Good, Fair, Poor" value={q.options.join(', ')}
                        onChangeText={(t) => updateQuestion(r.id, q.id, { options: t.split(',').map((s) => s.trim()).filter(Boolean) })} />
                    )}
                    <Text style={styles.qLabel}>Ask for</Text>
                    <View style={styles.optRow}>
                      {SCOPES.map((s) => (
                        <Pressable key={s} onPress={() => updateQuestion(r.id, q.id, { scope: s })}
                          style={[styles.optBtn, q.scope === s && styles.optBtnActiveAlt]}>
                          <Text style={[styles.optText, q.scope === s && { color: '#fff' }]}>{scopeLabel(s)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
                <Btn label="Add question" small kind="ghost" onPress={() => addQuestion(r.id)} icon={<Plus size={14} color={C.ink} />} />
              </View>
            )}
          </Card>
        );
      })}

      {/* Recent records */}
      {records.length > 0 && (
        <>
          <SectionTitle>Recent inspections</SectionTitle>
          <Card style={{ paddingVertical: 6 }}>
            {records.map((rec, i) => (
              <View key={rec.id}>
                {i > 0 && <Divider />}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
                  <History size={15} color={C.faint} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recAddr}>{rec.propertyAddress}</Text>
                    <Text style={styles.recMeta}>{rec.routineName} · {new Date(rec.startedAt).toLocaleDateString('en-GB')} · {rec.answers.filter((a) => a.value).length}/{rec.answers.length} answered</Text>
                  </View>
                  {rec.completedAt ? <Chip label="Done" tone="good" /> : <Chip label="In progress" tone="warn" />}
                </View>
              </View>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, fontSize: 15, color: C.ink, paddingVertical: 8, outlineStyle: 'none' } as any,
  propRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line },
  propAddr: { fontSize: 14.5, fontWeight: '700', color: C.ink },
  propMeta: { fontSize: 12, color: C.sub, marginTop: 2 },
  hint: { fontSize: 12.5, color: C.faint, marginTop: 8, lineHeight: 18 },
  pickTitle: { fontSize: 13, fontWeight: '600', color: C.sub },
  pickAddr: { fontSize: 16, fontWeight: '800', color: C.ink, marginTop: 2 },
  routinePick: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12 },
  routinePickText: { flex: 1, fontSize: 14.5, fontWeight: '700', color: C.ink },
  routineHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routineName: { flex: 1, fontSize: 16, fontWeight: '800', color: C.ink },
  routineNameInput: { flex: 1, fontSize: 16, fontWeight: '800', color: C.ink, borderBottomWidth: 1, borderBottomColor: C.accent, paddingVertical: 2, outlineStyle: 'none' } as any,
  qBlock: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, marginTop: 12 },
  qNum: { fontSize: 12, fontWeight: '800', color: C.accent },
  qLabel: { fontSize: 11.5, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  optBtn: { borderWidth: 1, borderColor: C.line, borderRadius: 99, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#fff' },
  optBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  optBtnActiveAlt: { backgroundColor: C.navy, borderColor: C.navy },
  optText: { fontSize: 12.5, fontWeight: '700', color: C.ink },
  recAddr: { fontSize: 13.5, fontWeight: '700', color: C.ink },
  recMeta: { fontSize: 11.5, color: C.sub, marginTop: 1 },
});
