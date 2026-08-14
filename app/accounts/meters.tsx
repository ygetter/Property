import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, Image, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Plus, Trash2, Save, Search, Gauge, Camera, ImageIcon, Mail, X } from 'lucide-react-native';
import { C } from '../../lib/theme';
import { Card, SectionTitle, Input, Btn, Chip, Empty, SearchField } from '../../components/ui';
import { store, uid } from '../../lib/storage';
import { MeterReading, Property, ReportSettings } from '../../lib/types';
import { dayLabel, meterEmailBody } from '../../lib/accounting';
import { sendMail } from '../../lib/report';
import { pickPhotos } from '../../lib/photos';
import { todayStr } from '../../lib/grouping';

export default function MetersScreen() {
  const [report, setReport] = useState<ReportSettings | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [readings, setReadings] = useState<MeterReading[]>([]);

  const [editId, setEditId] = useState<string | null>(null);
  const [date, setDate] = useState(todayStr());
  const [propertyId, setPropertyId] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setReport(await store.getReport());
    setProperties(await store.getProperties());
    setReadings(await store.getMeters());
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const reset = () => {
    setEditId(null); setDate(todayStr()); setPropertyId(''); setAddress('');
    setNote(''); setPhotos([]); setQ('');
  };

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return properties.slice(0, 6);
    return properties.filter((p) => `${p.address} ${p.postcode}`.toLowerCase().includes(t)).slice(0, 10);
  }, [properties, q]);

  const addPhotos = async (src: 'camera' | 'library') => {
    try {
      const uris = await pickPhotos(src, { multiple: src === 'library' });
      if (uris.length) setPhotos((p) => [...p, ...uris]);
    } catch (e: any) {
      Alert.alert('Could not add photos', e?.message || 'Please try again.');
    }
  };

  const save = async (): Promise<MeterReading | null> => {
    if (!address) { Alert.alert('Which property?', 'Choose the property these readings are for.'); return null; }
    if (photos.length === 0) { Alert.alert('Add a photo', 'Take or choose at least one photo of the meter.'); return null; }
    const entry: MeterReading = {
      id: editId || uid(), date, propertyId, address, note: note.trim(), photos, emailed: false,
    };
    const next = editId ? readings.map((r) => (r.id === editId ? entry : r)) : [entry, ...readings];
    next.sort((a, b) => b.date.localeCompare(a.date));
    setReadings(next);
    await store.setMeters(next);
    reset();
    return entry;
  };

  const emailReading = async (r: MeterReading) => {
    const to = report?.metersEmails || report?.recipientEmails || '';
    if (!to) {
      Alert.alert('No recipient set', 'Add who meter readings go to in Settings → Report & email.');
      return;
    }
    setBusy(true);
    try {
      const body = meterEmailBody(r, report?.senderName || '');
      await sendMail({
        to, cc: report?.ccEmails,
        subject: `Meter readings — ${r.address} — ${dayLabel(r.date)}`,
        body: Platform.OS === 'web' ? `${body}\n\n(Attach the meter photos before sending.)` : body,
        attachments: r.photos,
      });
      const next = readings.map((x) => (x.id === r.id ? { ...x, emailed: true } : x));
      setReadings(next);
      await store.setMeters(next);
    } catch (e: any) {
      Alert.alert('Could not email the readings', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: MeterReading) => {
    const next = readings.filter((x) => x.id !== r.id);
    setReadings(next);
    await store.setMeters(next);
    if (editId === r.id) reset();
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <Gauge size={19} color={C.accent} />
          <Text style={styles.h}>{editId ? 'Edit readings' : 'New meter readings'}</Text>
          {editId ? <Pressable onPress={reset}><Chip label="Cancel edit" tone="warn" /></Pressable> : null}
        </View>

        <Input label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />

        <Text style={styles.lab}>Property</Text>
        {address ? (
          <View style={styles.selRow}>
            <Text style={styles.selAddr} numberOfLines={2}>{address}</Text>
            <Pressable onPress={() => { setAddress(''); setPropertyId(''); }} hitSlop={8}><X size={15} color={C.sub} /></Pressable>
          </View>
        ) : (
          <>
            <SearchField value={q} onChangeText={setQ} placeholder="Search your properties" icon={<Search size={17} color={C.faint} />} />
            <View style={{ gap: 6, marginTop: 8 }}>
              {filtered.map((p) => (
                <Pressable key={p.id} onPress={() => { setPropertyId(p.id); setAddress(p.address); setQ(''); }}
                  style={({ pressed }) => [styles.pickRow, pressed && { opacity: 0.75 }]}>
                  <Text style={styles.pickAddr} numberOfLines={2}>{p.address}</Text>
                  <Plus size={15} color={C.faint} />
                </Pressable>
              ))}
              {q.trim().length > 2 && (
                <Pressable onPress={() => { setPropertyId(''); setAddress(q.trim()); setQ(''); }}
                  style={({ pressed }) => [styles.pickRow, pressed && { opacity: 0.75 }]}>
                  <Text style={[styles.pickAddr, { color: C.accent, fontWeight: '700' }]}>Use “{q.trim()}”</Text>
                </Pressable>
              )}
            </View>
          </>
        )}

        <View style={{ marginTop: 12 }}>
          <Input label="Notes (optional)" value={note} onChangeText={setNote} placeholder="e.g. Electric 41250, Gas 8123 — cupboard in hallway" />
        </View>

        <Text style={styles.lab}>Photos ({photos.length})</Text>
        {photos.length > 0 && (
          <View style={styles.grid}>
            {photos.map((uri, i) => (
              <View key={uri + i} style={styles.gridItem}>
                <Image source={{ uri }} style={styles.gridImg} resizeMode="cover" />
                <Pressable onPress={() => setPhotos((p) => p.filter((_, j) => j !== i))} style={styles.removePhoto}>
                  <X size={12} color="#fff" />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, marginTop: photos.length ? 9 : 0 }}>
          <View style={{ flex: 1 }}>
            <Btn label="Take photo" small kind="soft" icon={<Camera size={15} color={C.accent} />} onPress={() => addPhotos('camera')} />
          </View>
          <View style={{ flex: 1 }}>
            <Btn label="Choose photos" small kind="ghost" icon={<ImageIcon size={15} color={C.ink} />} onPress={() => addPhotos('library')} />
          </View>
        </View>

        <Btn label={editId ? 'Save changes' : 'Save readings'} icon={<Save size={16} color="#fff" />} onPress={() => { save(); }} />
        <View style={{ height: 8 }} />
        <Btn label="Save & email readings" kind="soft" loading={busy}
          icon={<Mail size={16} color={C.accent} />}
          onPress={async () => { const r = await save(); if (r) await emailReading(r); }} />
      </Card>

      <SectionTitle>Saved readings</SectionTitle>
      {readings.length === 0 ? (
        <Card><Empty icon={<Gauge size={26} color={C.faint} />} title="No readings yet" body="Pick a property, photograph the meters, and email them in one tap." /></Card>
      ) : readings.map((r) => (
        <Card key={r.id} style={{ paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <Text style={styles.addr} numberOfLines={2}>{r.address}</Text>
            {r.emailed ? <Chip label="Emailed" tone="good" /> : null}
            <Pressable onPress={() => { setEditId(r.id); setDate(r.date); setPropertyId(r.propertyId); setAddress(r.address); setNote(r.note); setPhotos(r.photos); }} hitSlop={8}>
              <Text style={styles.link}>Edit</Text>
            </Pressable>
            <Pressable onPress={() => remove(r)} hitSlop={8}><Trash2 size={16} color={C.bad} /></Pressable>
          </View>
          <Text style={styles.meta}>{dayLabel(r.date)} · {r.photos.length} photo{r.photos.length === 1 ? '' : 's'}</Text>
          {r.note ? <Text style={[styles.hint, { marginTop: 5 }]}>{r.note}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center', marginTop: 9 }}>
            {r.photos.slice(0, 4).map((uri, i) => <Image key={uri + i} source={{ uri }} style={styles.thumb} />)}
            <View style={{ flex: 1 }} />
            <Btn label="Email" small kind="soft" icon={<Mail size={14} color={C.accent} />} onPress={() => emailReading(r)} />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '800', color: C.ink, flex: 1 },
  lab: { fontSize: 12.5, fontWeight: '700', color: C.sub, marginBottom: 7 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.line, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 11 },
  pickAddr: { flex: 1, fontSize: 13, color: C.ink, lineHeight: 18 },
  selRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.accentSoft, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 12 },
  selAddr: { flex: 1, fontSize: 13.5, fontWeight: '700', color: C.accent, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridItem: { width: 88, height: 88 },
  gridImg: { width: 88, height: 88, borderRadius: 9, backgroundColor: C.bg },
  removePhoto: { position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 99, backgroundColor: 'rgba(23,34,46,0.75)', alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 40, height: 40, borderRadius: 7, backgroundColor: C.bg },
  addr: { flex: 1, fontSize: 14, fontWeight: '800', color: C.ink, lineHeight: 19 },
  meta: { fontSize: 12, color: C.sub },
  hint: { fontSize: 11.5, color: C.sub, lineHeight: 17 },
  link: { fontSize: 13, fontWeight: '700', color: C.accent },
});
