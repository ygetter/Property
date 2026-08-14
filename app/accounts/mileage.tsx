import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Plus, Minus, Trash2, Save, Search, Car } from 'lucide-react-native';
import { C } from '../../lib/theme';
import { Card, SectionTitle, Input, Btn, Chip, Empty, SearchField } from '../../components/ui';
import { store, uid } from '../../lib/storage';
import { AccountsSettings, MileageEntry, Property, DayVisit, DayCharge } from '../../lib/types';
import { money, milesOf, dayLabel, breakdownDay } from '../../lib/accounting';
import { todayStr } from '../../lib/grouping';

export default function MileageScreen() {
  const [settings, setSettings] = useState<AccountsSettings | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [entries, setEntries] = useState<MileageEntry[]>([]);

  // form state
  const [editId, setEditId] = useState<string | null>(null);
  const [date, setDate] = useState(todayStr());
  const [startMiles, setStart] = useState('');
  const [endMiles, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [visits, setVisits] = useState<DayVisit[]>([]);
  const [charges, setCharges] = useState<DayCharge[]>([]);
  const [q, setQ] = useState('');
  const [customAddr, setCustom] = useState('');

  const load = useCallback(async () => {
    setSettings(await store.getAccounts());
    setProperties(await store.getProperties());
    setEntries(await store.getMileage());
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const reset = () => {
    setEditId(null); setDate(todayStr()); setStart(''); setEnd(''); setNote('');
    setVisits([]); setCharges([]); setQ(''); setCustom('');
  };

  const bump = (p: { id: string; address: string }, delta: number) => {
    setVisits((prev) => {
      const i = prev.findIndex((v) => (v.propertyId || v.address) === (p.id || p.address));
      if (i === -1) return delta > 0 ? [...prev, { propertyId: p.id, address: p.address, count: 1 }] : prev;
      const next = [...prev];
      const count = next[i].count + delta;
      if (count <= 0) next.splice(i, 1); else next[i] = { ...next[i], count };
      return next;
    });
  };

  const bumpCharge = (c: { id: string; name: string; amount: number }, delta: number) => {
    setCharges((prev) => {
      const i = prev.findIndex((x) => x.chargeId === c.id);
      if (i === -1) return delta > 0 ? [...prev, { chargeId: c.id, name: c.name, amount: c.amount, times: 1 }] : prev;
      const next = [...prev];
      const times = next[i].times + delta;
      if (times <= 0) next.splice(i, 1); else next[i] = { ...next[i], times, amount: c.amount, name: c.name };
      return next;
    });
  };

  const countOf = (key: string) => visits.find((v) => (v.propertyId || v.address) === key)?.count || 0;
  const timesOf = (id: string) => charges.find((c) => c.chargeId === id)?.times || 0;

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return properties.slice(0, 8);
    return properties.filter((p) => `${p.address} ${p.postcode}`.toLowerCase().includes(t)).slice(0, 12);
  }, [properties, q]);

  const preview = useMemo(() => {
    if (!settings) return null;
    return breakdownDay({ id: 'x', date, startMiles, endMiles, visits, charges, note }, settings);
  }, [settings, date, startMiles, endMiles, visits, charges, note]);

  const save = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('Check the date', 'Please use the format YYYY-MM-DD, e.g. 2026-08-13.');
      return;
    }
    const miles = milesOf({ id: '', date, startMiles, endMiles, visits, charges, note });
    if (miles <= 0 && charges.length === 0) {
      Alert.alert('Nothing to save', 'Add an end mileage that is higher than the start, or add a charge.');
      return;
    }
    const entry: MileageEntry = {
      id: editId || uid(), date, startMiles, endMiles, visits, charges, note,
    };
    const next = editId ? entries.map((e) => (e.id === editId ? entry : e)) : [entry, ...entries];
    next.sort((a, b) => b.date.localeCompare(a.date));
    setEntries(next);
    await store.setMileage(next);
    reset();
  };

  const edit = (e: MileageEntry) => {
    setEditId(e.id); setDate(e.date); setStart(e.startMiles); setEnd(e.endMiles);
    setNote(e.note || ''); setVisits(e.visits || []); setCharges(e.charges || []);
  };

  const remove = async (e: MileageEntry) => {
    const next = entries.filter((x) => x.id !== e.id);
    setEntries(next);
    await store.setMileage(next);
    if (editId === e.id) reset();
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <Car size={19} color={C.accent} />
          <Text style={styles.h}>{editId ? 'Edit day' : 'Log a day'}</Text>
          {editId ? <Pressable onPress={reset}><Chip label="Cancel edit" tone="warn" /></Pressable> : null}
        </View>

        <Input label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Input label="Start mileage" value={startMiles} onChangeText={setStart} keyboardType="decimal-pad" placeholder="e.g. 41200" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="End mileage" value={endMiles} onChangeText={setEnd} keyboardType="decimal-pad" placeholder="e.g. 41400" />
          </View>
        </View>

        {preview && preview.miles > 0 ? (
          <View style={styles.calc}>
            <Text style={styles.calcText}>
              {preview.miles.toFixed(1)} miles × {money(settings?.ratePerMile || 0)} = <Text style={{ fontWeight: '800' }}>{money(preview.mileageCost)}</Text>
            </Text>
          </View>
        ) : null}

        <SectionTitle>Properties visited</SectionTitle>
        {visits.length > 0 && (
          <View style={{ gap: 7, marginBottom: 10 }}>
            {visits.map((v) => (
              <View key={v.propertyId || v.address} style={styles.visitRow}>
                <Text style={styles.visitAddr} numberOfLines={2}>{v.address}</Text>
                <View style={styles.stepper}>
                  <Pressable onPress={() => bump({ id: v.propertyId, address: v.address }, -1)} style={styles.step}><Minus size={14} color={C.ink} /></Pressable>
                  <Text style={styles.stepCount}>{v.count}</Text>
                  <Pressable onPress={() => bump({ id: v.propertyId, address: v.address }, 1)} style={styles.step}><Plus size={14} color={C.ink} /></Pressable>
                </View>
              </View>
            ))}
            <Text style={styles.hint}>
              {preview?.totalVisits || 0} visit{(preview?.totalVisits || 0) === 1 ? '' : 's'} · mileage split {money(preview?.perVisit || 0)} each
            </Text>
          </View>
        )}

        <SearchField value={q} onChangeText={setQ} placeholder="Search your properties" icon={<Search size={17} color={C.faint} />} />
        <View style={{ gap: 6, marginTop: 8 }}>
          {filtered.map((p) => {
            const n = countOf(p.id);
            return (
              <Pressable key={p.id} onPress={() => bump({ id: p.id, address: p.address }, 1)}
                style={({ pressed }) => [styles.pickRow, n > 0 && styles.pickRowOn, pressed && { opacity: 0.75 }]}>
                <Text style={styles.pickAddr} numberOfLines={2}>{p.address}</Text>
                {n > 0 ? <Chip label={`×${n}`} tone="accent" /> : <Plus size={15} color={C.faint} />}
              </Pressable>
            );
          })}
          {properties.length === 0 && (
            <Text style={styles.hint}>No saved properties yet — add them in Settings, or type an address below.</Text>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Input label="Other address (not in your list)" value={customAddr} onChangeText={setCustom} placeholder="e.g. 12 High Street, SW1A 1AA" />
          </View>
          <View style={{ marginBottom: 12 }}>
            <Btn label="Add" small onPress={() => {
              const a = customAddr.trim();
              if (!a) return;
              bump({ id: '', address: a }, 1);
              setCustom('');
            }} />
          </View>
        </View>

        <SectionTitle>Charges paid today</SectionTitle>
        <View style={{ gap: 7 }}>
          {(settings?.charges || []).map((c) => {
            const n = timesOf(c.id);
            return (
              <View key={c.id} style={[styles.visitRow, n > 0 && styles.pickRowOn]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.visitAddr}>{c.name}</Text>
                  <Text style={styles.hint}>{money(c.amount)} each</Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable onPress={() => bumpCharge(c, -1)} style={styles.step}><Minus size={14} color={C.ink} /></Pressable>
                  <Text style={styles.stepCount}>{n}</Text>
                  <Pressable onPress={() => bumpCharge(c, 1)} style={styles.step}><Plus size={14} color={C.ink} /></Pressable>
                </View>
              </View>
            );
          })}
          {(settings?.charges || []).length === 0 && (
            <Text style={styles.hint}>No charges set up — add them in Settings → Accounts &amp; rates.</Text>
          )}
        </View>

        <View style={{ marginTop: 12 }}>
          <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="Anything worth remembering about today" />
        </View>

        {preview ? (
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Day total</Text>
            <Text style={styles.totalVal}>{money(preview.total)}</Text>
          </View>
        ) : null}

        <Btn label={editId ? 'Save changes' : 'Save day'} icon={<Save size={16} color="#fff" />} onPress={save} />
      </Card>

      <SectionTitle>Logged days</SectionTitle>
      {entries.length === 0 ? (
        <Card><Empty icon={<Car size={26} color={C.faint} />} title="No days logged yet" body="Log your start and end mileage plus the properties you visited, and the app works out what each landlord owes." /></Card>
      ) : entries.map((e) => {
        const b = settings ? breakdownDay(e, settings) : null;
        return (
          <Card key={e.id} style={{ paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Text style={styles.dayDate}>{dayLabel(e.date)}</Text>
              <Chip label={`${milesOf(e).toFixed(1)} mi`} tone="neutral" />
              {b ? <Chip label={money(b.total)} tone="accent" /> : null}
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => edit(e)} hitSlop={8}><Text style={styles.link}>Edit</Text></Pressable>
              <Pressable onPress={() => remove(e)} hitSlop={8}><Trash2 size={16} color={C.bad} /></Pressable>
            </View>
            <Text style={styles.dayBody}>
              {(e.visits || []).map((v) => `${v.address}${v.count > 1 ? ` ×${v.count}` : ''}`).join(' · ') || 'No properties recorded'}
            </Text>
            {(e.charges || []).length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                {e.charges.map((c) => <Chip key={c.chargeId} label={`${c.name}${c.times > 1 ? ` ×${c.times}` : ''} ${money(c.amount * c.times)}`} tone="warn" />)}
              </View>
            )}
            {e.note ? <Text style={[styles.hint, { marginTop: 6 }]}>{e.note}</Text> : null}
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '800', color: C.ink, flex: 1 },
  calc: { backgroundColor: C.accentSoft, borderRadius: 9, padding: 10, marginBottom: 4 },
  calcText: { fontSize: 13, color: C.accent, fontWeight: '600' },
  visitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.bg, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 11 },
  visitAddr: { flex: 1, fontSize: 13.5, fontWeight: '700', color: C.ink, lineHeight: 19 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: 99, borderWidth: 1, borderColor: C.line, padding: 3 },
  step: { width: 27, height: 27, borderRadius: 99, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  stepCount: { minWidth: 18, textAlign: 'center', fontSize: 13.5, fontWeight: '800', color: C.ink },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.line, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 11 },
  pickRowOn: { borderColor: C.accent, backgroundColor: C.accentSoft },
  pickAddr: { flex: 1, fontSize: 13, color: C.ink, lineHeight: 18 },
  hint: { fontSize: 11.5, color: C.sub, lineHeight: 17 },
  totalBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.navy, borderRadius: 10, padding: 13, marginBottom: 12 },
  totalLabel: { color: '#C9D4E1', fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.9 },
  totalVal: { color: '#fff', fontSize: 19, fontWeight: '800' },
  dayDate: { fontSize: 14.5, fontWeight: '800', color: C.ink },
  dayBody: { fontSize: 12.5, color: C.sub, lineHeight: 18 },
  link: { fontSize: 13, fontWeight: '700', color: C.accent },
});
