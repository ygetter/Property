import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, Image, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Plus, Trash2, Save, Search, Receipt, Camera, ImageIcon, Mail, X } from 'lucide-react-native';
import { C } from '../../lib/theme';
import { Card, SectionTitle, Input, Btn, Chip, Empty, SearchField } from '../../components/ui';
import { store, uid } from '../../lib/storage';
import { AccountsSettings, CostEntry, Property, ReportSettings } from '../../lib/types';
import { money, buildCostHtml, dayLabel } from '../../lib/accounting';
import { generatePdf, sendMail } from '../../lib/report';
import { pickPhotos } from '../../lib/photos';
import { todayStr } from '../../lib/grouping';

export default function CostsScreen() {
  const [settings, setSettings] = useState<AccountsSettings | null>(null);
  const [report, setReport] = useState<ReportSettings | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [costs, setCosts] = useState<CostEntry[]>([]);

  const [editId, setEditId] = useState<string | null>(null);
  const [date, setDate] = useState(todayStr());
  const [label, setLabel] = useState('');
  const [isPreset, setIsPreset] = useState(false);
  const [amount, setAmount] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [receiptUri, setReceipt] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setSettings(await store.getAccounts());
    setReport(await store.getReport());
    setProperties(await store.getProperties());
    setCosts(await store.getCosts());
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const reset = () => {
    setEditId(null); setDate(todayStr()); setLabel(''); setIsPreset(false); setAmount('');
    setPropertyId(''); setAddress(''); setNote(''); setReceipt(''); setQ('');
  };

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return properties.slice(0, 6);
    return properties.filter((p) => `${p.address} ${p.postcode}`.toLowerCase().includes(t)).slice(0, 10);
  }, [properties, q]);

  const addPhoto = async (src: 'camera' | 'library') => {
    try {
      const uris = await pickPhotos(src);
      if (uris[0]) setReceipt(uris[0]);
    } catch (e: any) {
      Alert.alert('Could not add photo', e?.message || 'Please try again.');
    }
  };

  const save = async (): Promise<CostEntry | null> => {
    if (!label.trim()) { Alert.alert('What was it for?', 'Tap one of your set items or type what the cost was.'); return null; }
    const amt = parseFloat(amount || '0');
    if (!isFinite(amt) || amt <= 0) { Alert.alert('Check the amount', 'Enter how much it cost, e.g. 45.00'); return null; }
    const entry: CostEntry = {
      id: editId || uid(), date, label: label.trim(), isPreset, amount: amt.toFixed(2),
      propertyId, address, note: note.trim(), receiptUri, emailed: false,
    };
    const next = editId ? costs.map((c) => (c.id === editId ? entry : c)) : [entry, ...costs];
    next.sort((a, b) => b.date.localeCompare(a.date));
    setCosts(next);
    await store.setCosts(next);
    reset();
    return entry;
  };

  const emailCost = async (entry: CostEntry) => {
    const to = report?.costsEmails || report?.recipientEmails || '';
    if (!to) {
      Alert.alert('No accountant email set', 'Add the accountant’s email in Settings → Report & email.');
      return;
    }
    setBusy(true);
    try {
      const html = buildCostHtml([entry], {
        companyName: report?.companyName || '', senderName: report?.senderName || '',
        title: 'Cost / Expense',
      });
      const { uri } = await generatePdf(html, `cost-${entry.date}.pdf`);
      const attachments = [uri, entry.receiptUri].filter((x): x is string => !!x);
      const body = [
        'Hi,',
        '',
        `Please find a cost for ${entry.address || 'one of the properties'}:`,
        `• ${entry.label} — ${money(parseFloat(entry.amount))} on ${dayLabel(entry.date)}`,
        entry.note ? `• Notes: ${entry.note}` : '',
        entry.receiptUri ? '• Receipt photo attached.' : '• No receipt photo.',
        '',
        'Kind regards,',
        report?.senderName || '',
      ].filter(Boolean).join('\n');

      await sendMail({
        to, cc: report?.ccEmails,
        subject: `Cost — ${entry.label} — ${entry.address || entry.date}`,
        body: Platform.OS === 'web' ? `${body}\n\n(Attach the PDF and receipt before sending.)` : body,
        attachments,
      });
      const next = costs.map((c) => (c.id === entry.id ? { ...c, emailed: true } : c));
      setCosts(next);
      await store.setCosts(next);
    } catch (e: any) {
      Alert.alert('Could not email the cost', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: CostEntry) => {
    const next = costs.filter((x) => x.id !== c.id);
    setCosts(next);
    await store.setCosts(next);
    if (editId === c.id) reset();
  };

  const monthTotal = costs
    .filter((c) => c.date.slice(0, 7) === todayStr().slice(0, 7))
    .reduce((n, c) => n + (parseFloat(c.amount) || 0), 0);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <Receipt size={19} color={C.accent} />
          <Text style={styles.h}>{editId ? 'Edit cost' : 'Add a cost'}</Text>
          {editId ? <Pressable onPress={reset}><Chip label="Cancel edit" tone="warn" /></Pressable> : null}
        </View>

        <Text style={styles.lab}>Set items</Text>
        <View style={styles.presetWrap}>
          {(settings?.presets || []).map((p) => {
            const on = isPreset && label === p.name;
            return (
              <Pressable key={p.id}
                onPress={() => {
                  setLabel(p.name); setIsPreset(true);
                  if (p.amount > 0) setAmount(p.amount.toFixed(2));
                }}
                style={({ pressed }) => [styles.preset, on && styles.presetOn, pressed && { opacity: 0.75 }]}>
                <Plus size={13} color={on ? '#fff' : C.accent} />
                <Text style={[styles.presetText, on && { color: '#fff' }]}>{p.name}</Text>
                {p.amount > 0 && <Text style={[styles.presetAmt, on && { color: '#fff' }]}>{money(p.amount)}</Text>}
              </Pressable>
            );
          })}
          {(settings?.presets || []).length === 0 && (
            <Text style={styles.hint}>No set items yet — add the things you install in Settings → Accounts &amp; rates.</Text>
          )}
        </View>

        <View style={{ marginTop: 12 }}>
          <Input label="What was it? (or type your own)" value={label}
            onChangeText={(t) => { setLabel(t); setIsPreset(false); }} placeholder="e.g. Replacement lock" />
        </View>
        <Input label="Amount (£)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="e.g. 45.00" />

        <Text style={styles.lab}>Which property?</Text>
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
          <Input label="Notes (optional)" value={note} onChangeText={setNote} placeholder="Anything the accountant should know" />
        </View>

        <Text style={styles.lab}>Receipt</Text>
        {receiptUri ? (
          <View style={{ marginBottom: 12 }}>
            <Image source={{ uri: receiptUri }} style={styles.receipt} resizeMode="cover" />
            <Pressable onPress={() => setReceipt('')} style={styles.removePhoto}><X size={14} color="#fff" /></Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Btn label="Take photo" small kind="soft" icon={<Camera size={15} color={C.accent} />} onPress={() => addPhoto('camera')} />
            </View>
            <View style={{ flex: 1 }}>
              <Btn label="Choose photo" small kind="ghost" icon={<ImageIcon size={15} color={C.ink} />} onPress={() => addPhoto('library')} />
            </View>
          </View>
        )}

        <Btn label={editId ? 'Save changes' : 'Save cost'} icon={<Save size={16} color="#fff" />} onPress={() => { save(); }} />
        <View style={{ height: 8 }} />
        <Btn label="Save & email to accountant" kind="soft" loading={busy}
          icon={<Mail size={16} color={C.accent} />}
          onPress={async () => { const e = await save(); if (e) await emailCost(e); }} />
      </Card>

      <SectionTitle right={<Chip label={`${money(monthTotal)} this month`} tone="accent" />}>Logged costs</SectionTitle>
      {costs.length === 0 ? (
        <Card><Empty icon={<Receipt size={26} color={C.faint} />} title="No costs yet" body="Log what you install or buy, snap the receipt, and email it straight to the accountant." /></Card>
      ) : costs.map((c) => (
        <Card key={c.id} style={{ paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <Text style={styles.costLabel}>{c.label}</Text>
            <Chip label={money(parseFloat(c.amount) || 0)} tone="accent" />
            {c.emailed ? <Chip label="Emailed" tone="good" /> : null}
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => { setEditId(c.id); setDate(c.date); setLabel(c.label); setIsPreset(c.isPreset); setAmount(c.amount); setPropertyId(c.propertyId); setAddress(c.address); setNote(c.note); setReceipt(c.receiptUri); }} hitSlop={8}>
              <Text style={styles.link}>Edit</Text>
            </Pressable>
            <Pressable onPress={() => remove(c)} hitSlop={8}><Trash2 size={16} color={C.bad} /></Pressable>
          </View>
          <Text style={styles.costMeta}>{dayLabel(c.date)}{c.address ? ` · ${c.address}` : ''}</Text>
          {c.note ? <Text style={[styles.hint, { marginTop: 5 }]}>{c.note}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 9 }}>
            {c.receiptUri ? <Image source={{ uri: c.receiptUri }} style={styles.thumb} /> : <Text style={styles.hint}>No receipt photo</Text>}
            <View style={{ flex: 1 }} />
            <Btn label="Email" small kind="soft" icon={<Mail size={14} color={C.accent} />} onPress={() => emailCost(c)} />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '800', color: C.ink, flex: 1 },
  lab: { fontSize: 12.5, fontWeight: '700', color: C.sub, marginBottom: 7 },
  presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  preset: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.accent, backgroundColor: C.accentSoft, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 11 },
  presetOn: { backgroundColor: C.accent },
  presetText: { fontSize: 12.5, fontWeight: '700', color: C.accent },
  presetAmt: { fontSize: 11.5, fontWeight: '600', color: C.accent, opacity: 0.8 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.line, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 11 },
  pickAddr: { flex: 1, fontSize: 13, color: C.ink, lineHeight: 18 },
  selRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.accentSoft, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 12 },
  selAddr: { flex: 1, fontSize: 13.5, fontWeight: '700', color: C.accent, lineHeight: 19 },
  receipt: { width: '100%', height: 190, borderRadius: 10, backgroundColor: C.bg },
  removePhoto: { position: 'absolute', top: 8, right: 8, width: 27, height: 27, borderRadius: 99, backgroundColor: 'rgba(23,34,46,0.75)', alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: C.bg },
  costLabel: { fontSize: 14.5, fontWeight: '800', color: C.ink },
  costMeta: { fontSize: 12, color: C.sub },
  hint: { fontSize: 11.5, color: C.sub, lineHeight: 17 },
  link: { fontSize: 13, fontWeight: '700', color: C.accent },
});
