import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Car, Receipt, Gauge, ChevronRight, ChevronLeft, FileText, Mail, Share2, PoundSterling, SlidersHorizontal,
} from 'lucide-react-native';
import { C } from '../../lib/theme';
import { Card, SectionTitle, Btn, Chip, Empty } from '../../components/ui';
import { store } from '../../lib/storage';
import { AccountsSettings, MileageEntry, ReportSettings, CostEntry } from '../../lib/types';
import { money, monthKey, monthLabel, summariseMonth, buildMileageHtml } from '../../lib/accounting';
import { generatePdf, sharePdf, sendMail } from '../../lib/report';
import { todayStr } from '../../lib/grouping';

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, (m - 1) + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Accounts() {
  const router = useRouter();
  const [settings, setSettings] = useState<AccountsSettings | null>(null);
  const [report, setReport] = useState<ReportSettings | null>(null);
  const [entries, setEntries] = useState<MileageEntry[]>([]);
  const [costs, setCosts] = useState<CostEntry[]>([]);
  const [month, setMonth] = useState(monthKey(todayStr()));
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setSettings(await store.getAccounts());
    setReport(await store.getReport());
    setEntries(await store.getMileage());
    setCosts(await store.getCosts());
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sum = useMemo(
    () => (settings ? summariseMonth(entries, settings, month) : null),
    [entries, settings, month],
  );

  const monthCosts = costs.filter((c) => monthKey(c.date) === month);
  const costTotal = monthCosts.reduce((n, c) => n + (parseFloat(c.amount) || 0), 0);

  const makePdf = async (thenEmail: boolean) => {
    if (!sum || !settings) return;
    if (sum.days.length === 0) {
      Alert.alert('Nothing to report', `No mileage has been logged for ${monthLabel(month)}.`);
      return;
    }
    setBusy(true);
    try {
      const html = buildMileageHtml(sum, settings, {
        companyName: report?.companyName || '', senderName: report?.senderName || '',
      });
      const { uri } = await generatePdf(html, `mileage-${month}.pdf`);
      const to = report?.mileageEmails || report?.recipientEmails || '';

      if (thenEmail) {
        if (!to) {
          Alert.alert('No recipient set', 'Add who the mileage report goes to in Settings → Report & email.');
          return;
        }
        const body = [
          'Hi,',
          '',
          `Please find attached the mileage and charges breakdown for ${monthLabel(month)}.`,
          '',
          `Miles driven: ${sum.totalMiles.toFixed(0)}`,
          `Mileage at ${money(settings.ratePerMile)} per mile: ${money(sum.totalMileage)}`,
          `Tolls and charges: ${money(sum.totalCharges)}`,
          `Total to recharge: ${money(sum.grandTotal)}`,
          '',
          'Kind regards,',
          report?.senderName || '',
        ].join('\n');
        await sendMail({
          to, cc: report?.ccEmails,
          subject: `Mileage & charges — ${monthLabel(month)}`,
          body: Platform.OS === 'web' ? `${body}\n\n(Attach the PDF before sending.)` : body,
          attachments: uri ? [uri] : [],
        });
      } else if (uri) {
        await sharePdf(uri);
      } else if (Platform.OS === 'web') {
        Alert.alert('Report ready', 'The print dialog opened — choose “Save as PDF”.');
      }
    } catch (e: any) {
      Alert.alert('Could not build the report', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 50, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      {/* Month picker */}
      <View style={styles.monthRow}>
        <Pressable onPress={() => setMonth((m) => shiftMonth(m, -1))} hitSlop={10} style={styles.monthBtn}>
          <ChevronLeft size={18} color={C.ink} />
        </Pressable>
        <Text style={styles.monthText}>{monthLabel(month)}</Text>
        <Pressable onPress={() => setMonth((m) => shiftMonth(m, 1))} hitSlop={10} style={styles.monthBtn}>
          <ChevronRight size={18} color={C.ink} />
        </Pressable>
      </View>

      {/* Headline numbers */}
      <View style={styles.kpiRow}>
        <View style={styles.kpi}>
          <Text style={styles.kpiVal}>{(sum?.totalMiles || 0).toFixed(0)}</Text>
          <Text style={styles.kpiLab}>Miles</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiVal}>{money(sum?.totalMileage || 0)}</Text>
          <Text style={styles.kpiLab}>Mileage pay</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiVal}>{money(sum?.totalCharges || 0)}</Text>
          <Text style={styles.kpiLab}>Tolls</Text>
        </View>
        <View style={[styles.kpi, styles.kpiHl]}>
          <Text style={[styles.kpiVal, { color: C.accent }]}>{money(sum?.grandTotal || 0)}</Text>
          <Text style={styles.kpiLab}>Recharge</Text>
        </View>
      </View>

      {/* Quick actions */}
      <Card style={{ paddingVertical: 6 }}>
        <Row icon={<Car size={19} color={C.accent} />} title="Daily mileage & visits"
          desc={`${sum?.days.length || 0} day${(sum?.days.length || 0) === 1 ? '' : 's'} logged this month`}
          onPress={() => router.push('/accounts/mileage')} />
        <View style={styles.line} />
        <Row icon={<Receipt size={19} color={C.accent} />} title="Costs & receipts"
          desc={monthCosts.length ? `${monthCosts.length} item${monthCosts.length === 1 ? '' : 's'} · ${money(costTotal)}` : 'Log installs and one-off costs, attach receipts'}
          onPress={() => router.push('/accounts/costs')} />
        <View style={styles.line} />
        <Row icon={<Gauge size={19} color={C.accent} />} title="Meter readings"
          desc="Photograph meters and email them in one tap"
          onPress={() => router.push('/accounts/meters')} />
        <View style={styles.line} />
        <Row icon={<SlidersHorizontal size={19} color={C.accent} />} title="Rates, charges & set items"
          desc={`${money(settings?.ratePerMile || 0)} per mile · ${settings?.charges.length || 0} charges · ${settings?.presets.length || 0} set items`}
          onPress={() => router.push('/settings/accounts')} />
      </Card>

      {/* Per-property recharge */}
      <SectionTitle right={sum?.properties.length ? <Chip label={`${sum.properties.length} properties`} tone="neutral" /> : undefined}>
        Charge per property
      </SectionTitle>
      {!sum || sum.properties.length === 0 ? (
        <Card>
          <Empty icon={<PoundSterling size={26} color={C.faint} />} title="Nothing to apportion yet"
            body="Log a day's mileage and the properties you visited — the app splits the cost per visit and splits tolls between the properties you saw that day." />
        </Card>
      ) : (
        <Card style={{ paddingVertical: 8 }}>
          {sum.properties.map((p, i) => (
            <View key={(p.propertyId || p.address) + i}>
              {i > 0 && <View style={styles.line} />}
              <View style={styles.propRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.propAddr}>{p.address}</Text>
                  <Text style={styles.propMeta}>
                    {p.visits} visit{p.visits === 1 ? '' : 's'} · mileage {money(p.mileage)}
                    {p.chargesTotal > 0 ? ` · charges ${money(p.chargesTotal)}` : ''}
                  </Text>
                </View>
                <Text style={styles.propTotal}>{money(p.total)}</Text>
              </View>
            </View>
          ))}
          {sum.unallocated > 0 && (
            <Text style={styles.warnNote}>
              {money(sum.unallocated)} is not allocated because no properties were recorded on some days.
            </Text>
          )}
        </Card>
      )}

      {/* Report */}
      <SectionTitle>Monthly report</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <FileText size={20} color={C.accent} />
          <Text style={styles.repTitle}>Mileage & charges PDF</Text>
        </View>
        <Text style={styles.repBody}>
          Total due per property, how the split was worked out, and every day with its properties and charges
          {report?.mileageEmails || report?.recipientEmails
            ? `. Emails to ${report?.mileageEmails || report?.recipientEmails}.`
            : '. Set the recipient in Settings → Report & email.'}
        </Text>
        <Btn label="Email the report" loading={busy} icon={<Mail size={16} color="#fff" />} onPress={() => makePdf(true)} />
        <View style={{ height: 8 }} />
        <Btn label="Just make the PDF" kind="ghost" icon={<Share2 size={16} color={C.ink} />} onPress={() => makePdf(false)} />
      </Card>
    </ScrollView>
  );
}

function Row({ icon, title, desc, onPress }: { icon: React.ReactNode; title: string; desc: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
      <ChevronRight size={17} color={C.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 12 },
  monthBtn: { width: 34, height: 34, borderRadius: 99, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  monthText: { fontSize: 15.5, fontWeight: '800', color: C.ink },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  kpi: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 9 },
  kpiHl: { backgroundColor: C.accentSoft, borderColor: '#F6D6BB' },
  kpiVal: { fontSize: 15, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  kpiLab: { fontSize: 9.5, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
  rowDesc: { fontSize: 12.5, color: C.sub, marginTop: 2, lineHeight: 17 },
  line: { height: 1, backgroundColor: C.line },
  propRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  propAddr: { fontSize: 13.5, fontWeight: '700', color: C.ink, lineHeight: 19 },
  propMeta: { fontSize: 11.5, color: C.sub, marginTop: 2 },
  propTotal: { fontSize: 16, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  warnNote: { fontSize: 11.5, color: C.warn, marginTop: 8, lineHeight: 17 },
  repTitle: { fontSize: 15.5, fontWeight: '800', color: C.ink },
  repBody: { fontSize: 12.5, color: C.sub, lineHeight: 19, marginBottom: 12 },
});
