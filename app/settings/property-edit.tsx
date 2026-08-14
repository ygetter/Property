import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus, Minus, Trash2, Save, CornerDownRight, MapPin, Crosshair, Search } from 'lucide-react-native';
import { C } from '../../lib/theme';
import { Card, SectionTitle, Input, Btn } from '../../components/ui';
import { store, uid } from '../../lib/storage';
import { Property, PropertyUnit } from '../../lib/types';
import { currentPosition, lookupPostcode } from '../../lib/location';

const TYPES: Property['type'][] = ['HMO', 'House', 'Flats', 'Flat', 'Studio', 'Other'];
const UNIT_KINDS: PropertyUnit['kind'][] = ['hmo-room', 'flat', 'bedroom', 'studio', 'house', 'other'];
const KIND_LABELS: Record<PropertyUnit['kind'], string> = {
  'hmo-room': 'HMO room', flat: 'Flat', bedroom: 'Bedroom', studio: 'Studio', house: 'House', other: 'Other',
};

function newUnit(label: string, kind: PropertyUnit['kind'] = 'other'): PropertyUnit {
  return { id: uid(), label, kind, ensuite: false, kitchens: 0, bathrooms: 0, children: [] };
}

function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.6 }]}>
        <Minus size={14} color={C.ink} />
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable onPress={() => onChange(value + 1)} style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.6 }]}>
        <Plus size={14} color={C.ink} />
      </Pressable>
    </View>
  );
}

function UnitEditor({
  unit, onChange, onRemove, depth,
}: {
  unit: PropertyUnit; onChange: (u: PropertyUnit) => void; onRemove: () => void; depth: number;
}) {
  const canNest = depth < 2;
  return (
    <View style={[styles.unitBox, depth > 0 && styles.unitBoxNested]}>
      <View style={styles.unitHead}>
        {depth > 0 && <CornerDownRight size={14} color={C.faint} />}
        <Input style={styles.unitLabelInput} value={unit.label} onChangeText={(t) => onChange({ ...unit, label: t })} placeholder="e.g. Flat 1 / Room 3" />
        <Pressable onPress={onRemove} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.5 }}>
          <Trash2 size={15} color={C.faint} />
        </Pressable>
      </View>

      <View style={styles.optRow}>
        {UNIT_KINDS.map((k) => (
          <Pressable key={k} onPress={() => onChange({ ...unit, kind: k })}
            style={[styles.optBtn, unit.kind === k && styles.optBtnActive]}>
            <Text style={[styles.optText, unit.kind === k && { color: '#fff' }]}>{KIND_LABELS[k]}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.facRow}>
        <View style={styles.facItem}>
          <Text style={styles.facLabel}>Kitchens</Text>
          <Stepper value={unit.kitchens} onChange={(n) => onChange({ ...unit, kitchens: n })} />
        </View>
        <View style={styles.facItem}>
          <Text style={styles.facLabel}>Bathrooms</Text>
          <Stepper value={unit.bathrooms} onChange={(n) => onChange({ ...unit, bathrooms: n })} />
        </View>
        <Pressable onPress={() => onChange({ ...unit, ensuite: !unit.ensuite })}
          style={[styles.ensuiteBtn, unit.ensuite && styles.ensuiteActive]}>
          <Text style={[styles.ensuiteText, unit.ensuite && { color: '#fff' }]}>Ensuite {unit.ensuite ? '✓' : ''}</Text>
        </Pressable>
      </View>

      {unit.children.map((child) => (
        <UnitEditor key={child.id} unit={child} depth={depth + 1}
          onChange={(c) => onChange({ ...unit, children: unit.children.map((x) => (x.id === c.id ? c : x)) })}
          onRemove={() => onChange({ ...unit, children: unit.children.filter((x) => x.id !== child.id) })} />
      ))}
      {canNest && (
        <Pressable onPress={() => onChange({ ...unit, children: [...unit.children, newUnit(`${unit.kind === 'flat' ? 'Room' : 'Unit'} ${unit.children.length + 1}`, unit.kind === 'flat' ? 'bedroom' : 'other')] })}
          style={({ pressed }) => [styles.addChild, pressed && { opacity: 0.7 }]}>
          <Plus size={13} color={C.navy} />
          <Text style={styles.addChildText}>Add room / sub-unit inside {unit.label || 'this unit'}</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function PropertyEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const [p, setP] = useState<Property | null>(null);
  const [saved, setSaved] = useState(false);
  const [locBusy, setLocBusy] = useState<'postcode' | 'gps' | null>(null);
  const [locMsg, setLocMsg] = useState('');

  useEffect(() => {
    (async () => {
      const props = await store.getProperties();
      const existing = props.find((x) => x.id === id);
      setP(existing || {
        id: uid(), address: '', postcode: '', type: 'HMO',
        kitchens: 0, bathrooms: 0, notes: '', units: [], createdAt: Date.now(),
      });
    })();
  }, [id]);

  if (!p) return <View style={{ flex: 1 }} />;

  const set = (patch: Partial<Property>) => { setP({ ...p, ...patch }); setSaved(false); };

  const save = async () => {
    if (!p.address.trim()) {
      Alert.alert('Address needed', 'Enter the property address before saving.');
      return;
    }
    const props = await store.getProperties();
    const idx = props.findIndex((x) => x.id === p.id);
    if (idx >= 0) props[idx] = p; else props.push(p);
    await store.setProperties(props);
    setSaved(true);
    router.back();
  };

  const hasLoc = typeof p.lat === 'number' && typeof p.lng === 'number';

  const fromPostcode = async () => {
    setLocBusy('postcode');
    setLocMsg('');
    try {
      const c = await lookupPostcode(p.postcode);
      set({ lat: c.lat, lng: c.lng, locationSource: 'Postcode' });
      setLocMsg('✓ Location found from the postcode. Remember to save.');
    } catch (e: any) {
      setLocMsg(e?.message || 'Could not find that postcode.');
    } finally {
      setLocBusy(null);
    }
  };

  const fromGps = async () => {
    setLocBusy('gps');
    setLocMsg('');
    try {
      const c = await currentPosition();
      set({ lat: c.lat, lng: c.lng, locationSource: 'Pinned on site' });
      setLocMsg('✓ Pinned where you are standing now. Remember to save.');
    } catch (e: any) {
      setLocMsg(e?.message || 'Could not get your location.');
    } finally {
      setLocBusy(null);
    }
  };

  const defaultUnitLabel = () => {
    const n = p.units.length + 1;
    if (p.type === 'HMO') return `Room ${n}`;
    if (p.type === 'Flats' || p.type === 'House') return `Flat ${n}`;
    return `Unit ${n}`;
  };
  const defaultUnitKind = (): PropertyUnit['kind'] => {
    if (p.type === 'HMO') return 'hmo-room';
    if (p.type === 'Flats' || p.type === 'House') return 'flat';
    return 'other';
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 80, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <SectionTitle>Details</SectionTitle>
      <Card>
        <Input label="Address" value={p.address} onChangeText={(t) => set({ address: t })} placeholder="e.g. 128 Roehampton Vale, Roehampton, London" />
        <Input label="Postcode" value={p.postcode} onChangeText={(t) => set({ postcode: t })} placeholder="e.g. SW15 3RX" autoCapitalize="characters" />
        <Text style={styles.label}>Property type</Text>
        <View style={styles.optRow}>
          {TYPES.map((t) => (
            <Pressable key={t} onPress={() => set({ type: t })} style={[styles.optBtn, p.type === t && styles.optBtnActive]}>
              <Text style={[styles.optText, p.type === t && { color: '#fff' }]}>{t}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.facRow}>
          <View style={styles.facItem}>
            <Text style={styles.facLabel}>Shared kitchens</Text>
            <Stepper value={p.kitchens} onChange={(n) => set({ kitchens: n })} />
          </View>
          <View style={styles.facItem}>
            <Text style={styles.facLabel}>Shared bathrooms</Text>
            <Stepper value={p.bathrooms} onChange={(n) => set({ bathrooms: n })} />
          </View>
        </View>
        <Input label="Notes (optional)" value={p.notes} onChangeText={(t) => set({ notes: t })} placeholder="e.g. Key safe code, access notes…" multiline />
      </Card>

      <SectionTitle>Location</SectionTitle>
      <Card>
        <Text style={styles.structHint}>
          Save where this property is and it will show up in “Nearby properties” on the home screen when you
          have free time in the area. Easiest way: type the postcode above, then tap “Use postcode”.
        </Text>

        <View style={styles.locState}>
          <MapPin size={16} color={hasLoc ? C.good : C.faint} />
          <Text style={[styles.locText, hasLoc && { color: C.ink }]}>
            {hasLoc
              ? `Saved · ${p.lat!.toFixed(5)}, ${p.lng!.toFixed(5)}${p.locationSource ? ` (${p.locationSource})` : ''}`
              : 'No location saved yet'}
          </Text>
        </View>

        <View style={styles.locBtns}>
          <Btn label="Use postcode" small kind="soft" loading={locBusy === 'postcode'}
            icon={<Search size={14} color={C.accent} />} onPress={fromPostcode} />
          <Btn label="I'm here now" small kind="ghost" loading={locBusy === 'gps'}
            icon={<Crosshair size={14} color={C.ink} />} onPress={fromGps} />
          {hasLoc && (
            <Btn label="Clear" small kind="danger"
              onPress={() => { set({ lat: undefined, lng: undefined, locationSource: undefined }); setLocMsg(''); }} />
          )}
        </View>
        {locMsg ? <Text style={[styles.locMsg, locMsg.startsWith('✓') && { color: C.good }]}>{locMsg}</Text> : null}
      </Card>

      <SectionTitle>Structure — units & rooms</SectionTitle>
      <Card>
        <Text style={styles.structHint}>
          Build how the property is laid out. Example: a house with Flat 1 (2 bedrooms) and Flat 2 (a 4-bed HMO) —
          add “Flat 1” as a flat with 2 bedrooms inside it, then “Flat 2” as a flat with 4 HMO rooms inside it.
        </Text>
        {p.units.map((u) => (
          <UnitEditor key={u.id} unit={u} depth={0}
            onChange={(nu) => set({ units: p.units.map((x) => (x.id === nu.id ? nu : x)) })}
            onRemove={() => set({ units: p.units.filter((x) => x.id !== u.id) })} />
        ))}
        <Btn label={`Add ${p.type === 'HMO' ? 'room' : 'unit'}`} kind="ghost" small
          onPress={() => set({ units: [...p.units, newUnit(defaultUnitLabel(), defaultUnitKind())] })}
          icon={<Plus size={14} color={C.ink} />} />
      </Card>

      <Btn label={saved ? 'Saved ✓' : 'Save property'} onPress={save} kind={saved ? 'ghost' : 'primary'} icon={<Save size={15} color={saved ? C.ink : '#fff'} />} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12.5, fontWeight: '600', color: C.sub, marginBottom: 6 },
  optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  optBtn: { borderWidth: 1, borderColor: C.line, borderRadius: 99, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#fff' },
  optBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  optText: { fontSize: 12.5, fontWeight: '700', color: C.ink },
  facRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' },
  facItem: { gap: 6 },
  facLabel: { fontSize: 12.5, fontWeight: '600', color: C.sub },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1, borderColor: C.line, borderRadius: 9, backgroundColor: '#fff' },
  stepBtn: { padding: 8 },
  stepValue: { minWidth: 28, textAlign: 'center', fontSize: 14, fontWeight: '800', color: C.ink },
  structHint: { fontSize: 12.5, color: C.sub, lineHeight: 18, marginBottom: 14 },
  unitBox: { borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, marginBottom: 10, backgroundColor: '#fff' },
  unitBoxNested: { backgroundColor: C.bg, marginTop: 8, marginBottom: 6 },
  unitHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  unitLabelInput: { flex: 1, fontSize: 14.5, fontWeight: '700', color: C.ink, borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 4, outlineStyle: 'none' } as any,
  ensuiteBtn: { borderWidth: 1, borderColor: C.line, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#fff' },
  ensuiteActive: { backgroundColor: C.navy, borderColor: C.navy },
  ensuiteText: { fontSize: 12.5, fontWeight: '700', color: C.ink },
  addChild: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  addChildText: { fontSize: 12.5, fontWeight: '700', color: C.navy },
  locState: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  locText: { fontSize: 13, fontWeight: '600', color: C.sub, flex: 1 },
  locBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  locMsg: { fontSize: 12.5, color: C.bad, fontWeight: '600', marginTop: 10, lineHeight: 18 },
});
