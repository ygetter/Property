import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Bell, Plus, MapPin, Clock, Check, Trash2, UploadCloud, Wrench } from 'lucide-react-native';
import { C } from '../../lib/theme';
import { Card, SectionTitle, Input, Chip, Btn, Empty } from '../../components/ui';
import { store, uid } from '../../lib/storage';
import { Reminder } from '../../lib/types';

export default function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'time' | 'location'>('time');
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setReminders(await store.getReminders());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const persist = async (next: Reminder[]) => {
    setReminders(next);
    await store.setReminders(next);
  };

  const addReminder = async () => {
    if (!title.trim()) {
      Alert.alert('Title needed', 'What should the reminder say? e.g. “Upload inspection for 21 Endymion Road”.');
      return;
    }
    const r: Reminder = {
      id: uid(), title: title.trim(), type,
      time: type === 'time' ? time.trim() : undefined,
      address: type === 'location' ? address.trim() : undefined,
      note: note.trim(), done: false, createdAt: Date.now(),
    };
    await persist([r, ...reminders]);
    setTitle(''); setTime(''); setAddress(''); setNote('');
  };

  const toggleDone = async (id: string) => {
    await persist(reminders.map((r) => (r.id === id ? { ...r, done: !r.done } : r)));
  };

  const remove = async (id: string) => {
    await persist(reminders.filter((r) => r.id !== id));
  };

  const pending = reminders.filter((r) => !r.done);
  const done = reminders.filter((r) => r.done);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">

      <SectionTitle>New reminder</SectionTitle>
      <Card>
        <Input label="Reminder" value={title} onChangeText={setTitle} placeholder="e.g. Upload inspection to CRM" />
        <Text style={styles.label}>Trigger</Text>
        <View style={styles.typeRow}>
          <Pressable onPress={() => setType('time')} style={[styles.typeBtn, type === 'time' && styles.typeBtnActive]}>
            <Clock size={14} color={type === 'time' ? '#fff' : C.ink} />
            <Text style={[styles.typeText, type === 'time' && { color: '#fff' }]}>Time based</Text>
          </Pressable>
          <Pressable onPress={() => setType('location')} style={[styles.typeBtn, type === 'location' && styles.typeBtnActive]}>
            <MapPin size={14} color={type === 'location' ? '#fff' : C.ink} />
            <Text style={[styles.typeText, type === 'location' && { color: '#fff' }]}>Location based</Text>
          </Pressable>
        </View>
        {type === 'time' ? (
          <Input label="When" value={time} onChangeText={setTime} placeholder="e.g. Tomorrow 9:00, or 2026-08-13 17:30" autoCapitalize="none" />
        ) : (
          <Input label="At location" value={address} onChangeText={setAddress} placeholder="e.g. 21 Endymion Road, SW2 2BU" autoCapitalize="none" />
        )}
        <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="Extra details…" />
        <Btn label="Add reminder" onPress={addReminder} icon={<Plus size={15} color="#fff" />} />
      </Card>

      <SectionTitle>Upcoming ({pending.length})</SectionTitle>
      {pending.length === 0 && (
        <Card>
          <Empty icon={<Bell size={26} color={C.faint} />} title="No reminders"
            body="Add time-based or location-based reminders — e.g. to upload an inspection to your custom software when you finish on site." />
        </Card>
      )}
      {pending.map((r) => (
        <Card key={r.id}>
          <View style={styles.remRow}>
            <Pressable onPress={() => toggleDone(r.id)} style={({ pressed }) => [styles.check, pressed && { opacity: 0.6 }]}>
              <Check size={15} color="transparent" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.remTitle}>{r.title}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                {r.type === 'time' && r.time ? <Chip label={r.time} tone="info" /> : null}
                {r.type === 'location' && r.address ? <Chip label={r.address} tone="accent" /> : null}
                {r.title.toLowerCase().includes('upload') ? <Chip label="Upload task" tone="warn" /> : null}
              </View>
              {r.note ? <Text style={styles.remNote}>{r.note}</Text> : null}
            </View>
            <Pressable onPress={() => remove(r.id)} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.5 }}>
              <Trash2 size={15} color={C.faint} />
            </Pressable>
          </View>
        </Card>
      ))}

      {done.length > 0 && (
        <>
          <SectionTitle>Completed</SectionTitle>
          {done.map((r) => (
            <Card key={r.id} style={{ opacity: 0.6 }}>
              <View style={styles.remRow}>
                <Pressable onPress={() => toggleDone(r.id)} style={[styles.check, styles.checkDone]}>
                  <Check size={15} color="#fff" />
                </Pressable>
                <Text style={[styles.remTitle, { textDecorationLine: 'line-through', flex: 1 }]}>{r.title}</Text>
                <Pressable onPress={() => remove(r.id)} hitSlop={8}>
                  <Trash2 size={15} color={C.faint} />
                </Pressable>
              </View>
            </Card>
          ))}
        </>
      )}

      <Card style={{ backgroundColor: C.infoSoft, borderColor: C.infoSoft }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Wrench size={16} color={C.info} style={{ marginTop: 2 }} />
          <Text style={styles.moreText}>
            Next version: real push notifications at the set time, GPS geofence alerts when you arrive at a
            property, and one-tap “upload inspection” that opens your custom software. Send me the details and I’ll wire it up.
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12.5, fontWeight: '600', color: C.sub, marginBottom: 6 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.line, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#fff' },
  typeBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  typeText: { fontSize: 13, fontWeight: '700', color: C.ink },
  remRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkDone: { backgroundColor: C.good, borderColor: C.good },
  remTitle: { fontSize: 14.5, fontWeight: '700', color: C.ink, lineHeight: 20 },
  remNote: { fontSize: 12.5, color: C.sub, marginTop: 5, lineHeight: 18 },
  moreText: { flex: 1, fontSize: 12.5, color: '#31537E', lineHeight: 18 },
});
