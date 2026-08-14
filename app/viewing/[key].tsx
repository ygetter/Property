import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, Modal, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { Search, Plus, StickyNote, Tag, UserPlus, X, Check, Users } from 'lucide-react-native';
import { C } from '../../lib/theme';
import { Card, Input, Chip, Btn, SearchField } from '../../components/ui';
import { store } from '../../lib/storage';
import {
  searchApplicants, fetchApplicantsByIds, createApplicant,
  setApplicantStatus, appendApplicantNote, MondayError, getExpectedSource,
} from '../../lib/monday';
import {
  Applicant, MondaySettings, ViewingAttendee, VIEWING_OUTCOMES,
  LinkedApplicantRef, NEW_APPLICANT_GROUP,
} from '../../lib/types';
import { normName } from '../../lib/grouping';

/** Attendees added by name only (not found on the applicants board) get this ID prefix */
const LOCAL_ID = 'name:';

export default function ViewingDetail() {
  const router = useRouter();
  const expectedSource = getExpectedSource();
  const { key, expected } = useLocalSearchParams<{ key: string; expected?: string }>();
  const viewingKey = decodeURIComponent(key || '');

  // Applicants listed in the Applicants column on the schedule board.
  // Passed in from the viewings list, and also cached on the device so the
  // names are always here even if this screen is reopened or reloaded.
  const paramRefs: LinkedApplicantRef[] = React.useMemo(() => {
    try {
      const parsed = expected ? JSON.parse(decodeURIComponent(expected)) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }, [expected]);
  const [expectedRefs, setExpectedRefs] = useState<LinkedApplicantRef[]>(paramRefs);

  const [settings, setSettings] = useState<MondaySettings | null>(null);
  const [attendees, setAttendees] = useState<ViewingAttendee[]>([]);
  const [expectedFull, setExpectedFull] = useState<Applicant[]>([]);
  const [loadingExpected, setLoadingExpected] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Applicant[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const [openNoteFor, setOpenNoteFor] = useState<string | null>(null);
  const [openStatusFor, setOpenStatusFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notesCache, setNotesCache] = useState<Record<string, string>>({});

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [adding, setAdding] = useState(false);
  const [addingExpected, setAddingExpected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await store.getMonday();
    setSettings(s);
    const att = await store.getAttendance();
    setAttendees(att[viewingKey] || []);

    // Prefer the list passed in; otherwise use the cached list for this viewing
    let list = paramRefs;
    if (list.length === 0) {
      const cache = await store.getExpected();
      list = cache[viewingKey] || [];
    }
    setExpectedRefs(list);

    // Pull full details (email / mobile / group / subitems) for the linked applicants
    const ids = list.map((r) => r.id).filter(Boolean);
    if (ids.length && s.apiToken) {
      setLoadingExpected(true);
      try {
        setExpectedFull(await fetchApplicantsByIds(s, ids));
      } catch {
        setExpectedFull([]);
      } finally {
        setLoadingExpected(false);
      }
    }
  }, [viewingKey, paramRefs]);

  useEffect(() => { load(); }, [load]);

  // ---- Debounced server-side search across the entire applicants board ----
  const seq = useRef(0);
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults([]); setSearched(false); setError(''); return; }
    if (!settings?.apiToken || !settings?.applicantsBoardId) return;
    const mine = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const found = await searchApplicants(settings, term);
        if (seq.current !== mine) return;
        setResults(found);
        setError('');
      } catch (e: any) {
        if (seq.current !== mine) return;
        setResults([]);
        setError(e instanceof MondayError ? e.message : 'Search failed.');
      } finally {
        if (seq.current === mine) { setSearching(false); setSearched(true); }
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, settings]);

  const persistAttendees = async (next: ViewingAttendee[]) => {
    setAttendees(next);
    const att = await store.getAttendance();
    att[viewingKey] = next;
    await store.setAttendance(att);
  };

  const toAttendee = (a: Applicant, isSubitem = false): ViewingAttendee => ({
    applicantId: a.id, name: a.name, group: a.group, email: a.email, mobile: a.mobile,
    status: a.viewingStatus || '', note: '', isSubitem, addedAt: Date.now(),
  });

  const addApplicant = async (a: Applicant) => {
    const existing = new Set(attendees.map((t) => t.applicantId));
    const toAdd: ViewingAttendee[] = [];
    if (!existing.has(a.id)) toAdd.push(toAttendee(a));
    // Subitems (joint applicants / pairs) are added automatically
    for (const sub of a.subitems || []) {
      if (!existing.has(sub.id)) toAdd.push(toAttendee({ ...sub, group: a.group }, true));
    }
    if (a.viewingNotes) setNotesCache((p) => ({ ...p, [a.id]: a.viewingNotes }));
    if (toAdd.length === 0) return;
    await persistAttendees([...attendees, ...toAdd]);
    setQuery('');
    setResults([]);
    setSearched(false);
  };

  const removeAttendee = async (id: string) => {
    await persistAttendees(attendees.filter((t) => t.applicantId !== id));
  };

  const saveNote = async (att: ViewingAttendee) => {
    if (!noteDraft.trim() || !settings) return;
    if (att.applicantId.startsWith(LOCAL_ID)) {
      Alert.alert('Not on the applicants board',
        'This person was added by name only, so there is no Monday.com row to write to. Search for them above (or add them to Monday.com) to save notes and statuses.');
      return;
    }
    setBusyId(att.applicantId);
    try {
      const combined = await appendApplicantNote(
        settings, att.applicantId, notesCache[att.applicantId] || '', noteDraft.trim(),
      );
      setNotesCache((p) => ({ ...p, [att.applicantId]: combined }));
      await persistAttendees(attendees.map((t) => (t.applicantId === att.applicantId ? { ...t, note: noteDraft.trim() } : t)));
      setNoteDraft('');
      setOpenNoteFor(null);
    } catch (e: any) {
      Alert.alert('Could not save note', e?.message || 'Monday.com error');
    } finally {
      setBusyId(null);
    }
  };

  const saveStatus = async (att: ViewingAttendee, status: string) => {
    if (!settings) return;
    if (att.applicantId.startsWith(LOCAL_ID)) {
      Alert.alert('Not on the applicants board',
        'This person was added by name only, so there is no Monday.com row to write to. Search for them above (or add them to Monday.com) to save notes and statuses.');
      return;
    }
    setBusyId(att.applicantId);
    try {
      await setApplicantStatus(settings, att.applicantId, status);
      await persistAttendees(attendees.map((t) => (t.applicantId === att.applicantId ? { ...t, status } : t)));
      setOpenStatusFor(null);
    } catch (e: any) {
      Alert.alert('Could not save status', e?.message || 'Monday.com error');
    } finally {
      setBusyId(null);
    }
  };

  const submitNewApplicant = async () => {
    if (!settings || !newName.trim()) return;
    setAdding(true);
    try {
      const id = await createApplicant(settings, {
        name: newName.trim(), email: newEmail.trim(), mobile: newMobile.trim(),
      });
      // Add straight into this viewing
      await addApplicant({
        id, name: newName.trim(), email: newEmail.trim(), mobile: newMobile.trim(),
        group: NEW_APPLICANT_GROUP, viewingStatus: '', viewingNotes: '', subitems: [],
      });
      setAddOpen(false);
      setNewName(''); setNewEmail(''); setNewMobile('');
    } catch (e: any) {
      Alert.alert('Could not add applicant', e?.message || 'Monday.com error');
    } finally {
      setAdding(false);
    }
  };

  const statusTone = (s: string) =>
    s === 'Good' || s === 'Very Good' ? 'good' : s === 'Not Good' ? 'bad' : s ? 'warn' : 'neutral';

  const attendedIds = new Set(attendees.map((a) => a.applicantId));
  const attendedNames = new Set(attendees.map((a) => normName(a.name)));

  // Expected applicants, with a tick against anyone already marked as attended.
  // Matched on the Monday ID when there is one, otherwise on the name — so the
  // list still works when the schedule column only gives us names.
  const expectedRows = expectedRefs.map((ref) => {
    const full = expectedFull.find((f) => f.id === ref.id);
    const added = (!!ref.id && attendedIds.has(ref.id)) || attendedNames.has(normName(ref.name));
    return { ref, full, added };
  });

  const addExpected = async (row: { ref: LinkedApplicantRef; full?: Applicant }) => {
    if (row.full) return addApplicant(row.full);
    setAddingExpected(row.ref.id || row.ref.name);
    try {
      // We have the Monday item — fetch the full record so notes and statuses sync
      if (row.ref.id && settings) {
        try {
          const [a] = await fetchApplicantsByIds(settings, [row.ref.id]);
          if (a) return await addApplicant(a);
        } catch { /* fall through to the name-based paths below */ }
        return await addApplicant({
          id: row.ref.id, name: row.ref.name, email: '', mobile: '', group: '',
          viewingStatus: '', viewingNotes: '', subitems: [],
        });
      }
      // Names only (the column isn't a connected-boards column) — look the person
      // up on the applicants board by name so everything still syncs
      if (settings?.apiToken && settings?.applicantsBoardId && row.ref.name.trim().length >= 2) {
        try {
          const found = await searchApplicants(settings, row.ref.name.trim());
          const exact = found.find((f) => normName(f.name) === normName(row.ref.name));
          if (exact) return await addApplicant(exact);
        } catch { /* add by name only, below */ }
      }
      // Last resort: record them on this viewing by name only
      await addApplicant({
        id: `${LOCAL_ID}${normName(row.ref.name)}`, name: row.ref.name, email: '', mobile: '',
        group: '', viewingStatus: '', viewingNotes: '', subitems: [],
      });
    } finally {
      setAddingExpected(null);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Viewing' }} />

      {/* Search applicants — searches the whole board on Monday.com */}
      <Card>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, email or mobile…"
          icon={<Search size={17} color={C.faint} />}
        />
        <Text style={styles.searchHint}>
          {searching ? 'Searching the whole applicants board…' : 'Searches every applicant on the board, not just the first page.'}
        </Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {query.trim().length >= 2 && !(settings?.apiToken && settings?.applicantsBoardId) && (
          <Text style={styles.errorText}>Connect the applicants board in Settings to search.</Text>
        )}

        {query.trim().length >= 2 && (
          <View style={{ marginTop: 6 }}>
            {searching && <ActivityIndicator color={C.accent} style={{ marginVertical: 10 }} />}
            {!searching && results.map((a) => (
              <Pressable key={a.id} onPress={() => addApplicant(a)}
                style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: C.bg }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName}>{a.name}</Text>
                  <Text style={styles.resultMeta}>{[a.email, a.mobile].filter(Boolean).join(' · ') || 'No contact details'}</Text>
                  {a.group ? <View style={{ marginTop: 4 }}><Chip label={a.group} tone="neutral" /></View> : null}
                </View>
                {a.subitems?.length > 0 && <Chip label={`+${a.subitems.length} joint`} tone="info" />}
                {attendedIds.has(a.id) ? <Check size={18} color={C.good} /> : <Plus size={18} color={C.accent} />}
              </Pressable>
            ))}
            {!searching && searched && results.length === 0 && (
              <View style={{ paddingVertical: 8 }}>
                <Text style={styles.noResult}>No match anywhere on the applicants board.</Text>
                <Btn label={`Add “${query.trim()}” to Monday.com`} small kind="soft"
                  icon={<UserPlus size={15} color={C.accent} />}
                  onPress={() => { setNewName(query.trim()); setAddOpen(true); }} />
              </View>
            )}
          </View>
        )}
      </Card>

      {/* Attendees */}
      <Text style={styles.sectionLabel}>Attended ({attendees.length})</Text>
      {attendees.length === 0 && (
        <Card><Text style={styles.emptyText}>Add applicants from the expected list below, or search above. Joint applicants (subitems) are added automatically.</Text></Card>
      )}
      {attendees.map((att) => (
        <Card key={att.applicantId}>
          <View style={styles.attHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.attName}>{att.name}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                {att.group ? <Chip label={att.group} tone="neutral" /> : null}
                {att.isSubitem && <Chip label="Joint applicant" tone="info" />}
                {att.applicantId.startsWith(LOCAL_ID) && <Chip label="Name only" tone="warn" />}
                {att.status ? <Chip label={att.status} tone={statusTone(att.status) as any} /> : null}
              </View>
            </View>
            <Pressable onPress={() => removeAttendee(att.applicantId)} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.5 }}>
              <X size={17} color={C.faint} />
            </Pressable>
          </View>

          {att.note ? <Text style={styles.savedNote}>“{att.note}”</Text> : null}

          <View style={styles.attActions}>
            <Pressable
              onPress={() => { setOpenNoteFor(openNoteFor === att.applicantId ? null : att.applicantId); setOpenStatusFor(null); setNoteDraft(''); }}
              style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}>
              <Plus size={14} color={C.accent} />
              <StickyNote size={15} color={C.accent} />
              <Text style={styles.actionText}>Note</Text>
            </Pressable>
            <Pressable
              onPress={() => { setOpenStatusFor(openStatusFor === att.applicantId ? null : att.applicantId); setOpenNoteFor(null); }}
              style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}>
              <Plus size={14} color={C.navy} />
              <Tag size={15} color={C.navy} />
              <Text style={[styles.actionText, { color: C.navy }]}>Status</Text>
            </Pressable>
            {busyId === att.applicantId && <ActivityIndicator size="small" color={C.accent} style={{ marginLeft: 6 }} />}
          </View>

          {openNoteFor === att.applicantId && (
            <View style={styles.reveal}>
              <Input placeholder="Viewing note — saved to Monday.com…" value={noteDraft} onChangeText={setNoteDraft} multiline style={{ minHeight: 64, textAlignVertical: 'top' }} />
              <Btn label="Save note to Monday.com" small loading={busyId === att.applicantId} onPress={() => saveNote(att)} />
            </View>
          )}

          {openStatusFor === att.applicantId && (
            <View style={styles.reveal}>
              <View style={styles.statusGrid}>
                {VIEWING_OUTCOMES.map((s) => (
                  <Pressable key={s} onPress={() => saveStatus(att, s)} disabled={busyId === att.applicantId}
                    style={({ pressed }) => [styles.statusBtn, att.status === s && styles.statusBtnActive, pressed && { opacity: 0.7 }]}>
                    {att.status === s && <Check size={13} color="#fff" />}
                    <Text style={[styles.statusBtnText, att.status === s && { color: '#fff' }]}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </Card>
      ))}

      {/* Expected applicants from the Applicants column on the schedule board */}
      <Text style={styles.sectionLabel}>
        Expected at this viewing{expectedRefs.length > 0 ? ` (${expectedRefs.length})` : ''}
      </Text>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Users size={15} color={C.sub} />
          <Text style={styles.expectedHint}>
            {expectedRefs.length > 0
              ? (expectedSource ? `${expectedSource} — tap a name to mark them as attended.` : 'Tap a name to mark them as attended.')
              : 'No applicants are listed against this viewing on the schedule board.'}
          </Text>
        </View>
        {loadingExpected && <ActivityIndicator color={C.accent} style={{ marginVertical: 8 }} />}
        {expectedRefs.length === 0 && !loadingExpected && (
          <>
            <Text style={styles.expectedEmpty}>
              The app checked the Applicants column you set, every other column on the schedule board, and the
              applicants board itself, and nothing came back for this viewing. The column finder below shows what
              each column on your board actually contains so you can point the app at the right one.
            </Text>
            {expectedSource ? <Text style={styles.expectedSource}>Last check: {expectedSource}</Text> : null}
            <View style={{ marginTop: 12 }}>
              <Btn label="Find the applicants column" small kind="soft" icon={<Search size={14} color={C.accent} />}
                onPress={() => router.push('/settings/monday-columns')} />
            </View>
          </>
        )}
        {expectedRows.map(({ ref, full, added }) => {
          const busy = addingExpected === (ref.id || ref.name);
          return (
            <Pressable key={ref.id || ref.name} disabled={added || busy}
              onPress={() => addExpected({ ref, full })}
              style={({ pressed }) => [styles.expRow, pressed && !added && { backgroundColor: C.bg }, added && { opacity: 0.55 }]}>
              <View style={[styles.expDot, added && { backgroundColor: C.good, borderColor: C.good }]}>
                {added && <Check size={12} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.expName, added && { textDecorationLine: 'line-through' }]}>{ref.name}</Text>
                {full?.group ? <Text style={styles.expGroup}>{full.group}</Text> : null}
              </View>
              {busy
                ? <ActivityIndicator size="small" color={C.accent} />
                : added
                  ? <Chip label="Attended" tone="good" />
                  : <Plus size={17} color={C.accent} />}
            </Pressable>
          );
        })}
      </Card>

      {/* Add applicant modal — always goes into the “To Check” group */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add applicant to Monday.com</Text>
            <View style={styles.groupNotice}>
              <Text style={styles.groupNoticeText}>Will be added to the “{NEW_APPLICANT_GROUP}” group.</Text>
            </View>
            <Input label="Name" value={newName} onChangeText={setNewName} placeholder="Full name" />
            <Input label="Email" value={newEmail} onChangeText={setNewEmail} placeholder="email@example.com" autoCapitalize="none" keyboardType="email-address" />
            <Input label="Mobile" value={newMobile} onChangeText={setNewMobile} placeholder="07…" keyboardType="phone-pad" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Btn label="Cancel" kind="ghost" onPress={() => setAddOpen(false)} /></View>
              <View style={{ flex: 1 }}><Btn label="Add" loading={adding} onPress={submitNewApplicant} /></View>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  searchHint: { fontSize: 11.5, color: C.faint, marginTop: 8 },
  errorText: { color: C.bad, fontSize: 12.5, fontWeight: '600', marginTop: 8 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  resultName: { fontSize: 14.5, fontWeight: '700', color: C.ink },
  resultMeta: { fontSize: 12, color: C.sub, marginTop: 1 },
  noResult: { fontSize: 13, color: C.sub, marginBottom: 10 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 10 },
  emptyText: { fontSize: 13, color: C.sub, lineHeight: 19 },
  attHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  attName: { fontSize: 16, fontWeight: '800', color: C.ink },
  savedNote: { fontSize: 12.5, color: C.sub, fontStyle: 'italic', marginTop: 8, lineHeight: 18 },
  attActions: { flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: C.bg },
  actionText: { fontSize: 12.5, fontWeight: '700', color: C.accent },
  reveal: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: C.line, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#fff' },
  statusBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  statusBtnText: { fontSize: 13, fontWeight: '700', color: C.ink },
  expectedHint: { fontSize: 11.5, color: C.sub, flex: 1, lineHeight: 17 },
  expectedEmpty: { fontSize: 12.5, color: C.faint, lineHeight: 18, marginTop: 8 },
  expectedSource: { fontSize: 11.5, color: C.sub, lineHeight: 17, marginTop: 8, fontStyle: 'italic' },
  expRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.line, borderRadius: 8, paddingHorizontal: 4 },
  expDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.6, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  expName: { fontSize: 14.5, fontWeight: '700', color: C.ink },
  expGroup: { fontSize: 11.5, color: C.sub, marginTop: 1 },
  modalBg: { flex: 1, backgroundColor: 'rgba(15,23,32,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, maxWidth: 460, width: '100%', alignSelf: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: C.ink, marginBottom: 10 },
  groupNotice: { backgroundColor: C.accentSoft, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 11, marginBottom: 14 },
  groupNoticeText: { fontSize: 12.5, color: C.accent, fontWeight: '700' },
});
