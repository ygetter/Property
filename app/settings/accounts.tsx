import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, TextInput } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Plus, Trash2, Save, PoundSterling, Wrench } from 'lucide-react-native';
import { C } from '../../lib/theme';
import { Card, SectionTitle, Input, Btn } from '../../components/ui';
import { store, uid, DEFAULT_ACCOUNTS } from '../../lib/storage';
import { AccountsSettings, TravelCharge, PresetCostItem } from '../../lib/types';

export default function AccountsSettingsScreen() {
  const [s, setS] = useState<AccountsSettings>(DEFAULT_ACCOUNTS);
  const [rate, setRate] = useState('0.50');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const v = await store.getAccounts();
    setS(v);
    setRate(v.ratePerMile.toFixed(2));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    const r = parseFloat(rate);
    if (!isFinite(r) || r < 0) { Alert.alert('Check the rate', 'Enter the pay per mile, e.g. 0.50'); return; }
    const clean: AccountsSettings = {
      ratePerMile: r,
      charges: s.charges.filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim(), amount: Number(c.amount) || 0 })),
      presets: s.presets.filter((p) => p.name.trim()).map((p) => ({ ...p, name: p.name.trim(), amount: Number(p.amount) || 0 })),
    };
    setS(clean);
    await store.setAccounts(clean);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const setCharge = (id: string, patch: Partial<TravelCharge>) =>
    setS((p) => ({ ...p, charges: p.charges.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const setPreset = (id: string, patch: Partial<PresetCostItem>) =>
    setS((p) => ({ ...p, presets: p.presets.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <PoundSterling size={19} color={C.accent} />
          <Text style={styles.h}>Mileage rate</Text>
        </View>
        <Input label="Pay per mile (£)" value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="0.50" />
        <Text style={styles.hint}>
          Used for every mileage calculation. Change it here and future reports use the new rate.
        </Text>
      </Card>

      <SectionTitle>Tolls & charges</SectionTitle>
      <Card>
        <Text style={styles.hint}>
          These appear as buttons when you log a day. On the report they are split equally between the different
          properties you visited that day.
        </Text>
        <View style={{ height: 12 }} />
        {s.charges.map((c) => (
          <View key={c.id} style={styles.editRow}>
            <TextInput value={c.name} onChangeText={(t) => setCharge(c.id, { name: t })}
              placeholder="Charge name" placeholderTextColor={C.faint} style={[styles.cell, { flex: 1 }]} />
            <View style={styles.amountWrap}>
              <Text style={styles.pound}>£</Text>
              <TextInput value={String(c.amount)} onChangeText={(t) => setCharge(c.id, { amount: Number(t.replace(/[^\d.]/g, '')) || 0 })}
                keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.faint} style={styles.amountInput} />
            </View>
            <Pressable onPress={() => setS((p) => ({ ...p, charges: p.charges.filter((x) => x.id !== c.id) }))} hitSlop={8}>
              <Trash2 size={16} color={C.bad} />
            </Pressable>
          </View>
        ))}
        <Btn label="Add a charge" small kind="ghost" icon={<Plus size={15} color={C.ink} />}
          onPress={() => setS((p) => ({ ...p, charges: [...p.charges, { id: uid(), name: '', amount: 0 }] }))} />
      </Card>

      <SectionTitle>Set items you install</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 }}>
          <Wrench size={17} color={C.sub} />
          <Text style={styles.hint2}>One-tap buttons on the costs screen. Leave the price at 0 to type it each time.</Text>
        </View>
        {s.presets.map((p) => (
          <View key={p.id} style={styles.editRow}>
            <TextInput value={p.name} onChangeText={(t) => setPreset(p.id, { name: t })}
              placeholder="e.g. Lock change" placeholderTextColor={C.faint} style={[styles.cell, { flex: 1 }]} />
            <View style={styles.amountWrap}>
              <Text style={styles.pound}>£</Text>
              <TextInput value={String(p.amount)} onChangeText={(t) => setPreset(p.id, { amount: Number(t.replace(/[^\d.]/g, '')) || 0 })}
                keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.faint} style={styles.amountInput} />
            </View>
            <Pressable onPress={() => setS((prev) => ({ ...prev, presets: prev.presets.filter((x) => x.id !== p.id) }))} hitSlop={8}>
              <Trash2 size={16} color={C.bad} />
            </Pressable>
          </View>
        ))}
        <Btn label="Add a set item" small kind="ghost" icon={<Plus size={15} color={C.ink} />}
          onPress={() => setS((p) => ({ ...p, presets: [...p.presets, { id: uid(), name: '', amount: 0 }] }))} />
      </Card>

      <Btn label={saved ? 'Saved' : 'Save settings'} icon={<Save size={16} color="#fff" />} onPress={save} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '800', color: C.ink },
  hint: { fontSize: 12, color: C.sub, lineHeight: 18 },
  hint2: { flex: 1, fontSize: 12, color: C.sub, lineHeight: 18 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },
  cell: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 9,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14.5, color: C.ink,
    ...({ outlineStyle: 'none' } as any),
  },
  amountWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 2, width: 96,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 9, paddingHorizontal: 10,
  },
  pound: { fontSize: 14, color: C.sub, fontWeight: '700' },
  amountInput: {
    flex: 1, paddingVertical: 10, fontSize: 14.5, color: C.ink,
    ...({ outlineStyle: 'none' } as any),
  },
});
