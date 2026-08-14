import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Plug, Building2, Mail, ChevronRight, Database, PoundSterling } from 'lucide-react-native';
import { C } from '../../lib/theme';
import { Card, Chip } from '../../components/ui';
import { store } from '../../lib/storage';

function Row({ icon, title, desc, onPress, badge }: { icon: React.ReactNode; title: string; desc: string; onPress: () => void; badge?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.rowTitle}>{title}</Text>
          {badge}
        </View>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
      <ChevronRight size={17} color={C.faint} />
    </Pressable>
  );
}

export default function Settings() {
  const router = useRouter();
  const [mondayOk, setMondayOk] = useState(false);
  const [propCount, setPropCount] = useState(0);
  const [emailsSet, setEmailsSet] = useState(false);
  const [rateLabel, setRateLabel] = useState('');

  useFocusEffect(useCallback(() => {
    (async () => {
      const m = await store.getMonday();
      const p = await store.getProperties();
      const r = await store.getReport();
      setMondayOk(!!(m.apiToken && m.scheduleBoardId && m.applicantsBoardId));
      setPropCount(p.length);
      setEmailsSet(!!r.recipientEmails);
      const a = await store.getAccounts();
      setRateLabel(`£${a.ratePerMile.toFixed(2)}/mile`);
    })();
  }, []));

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Card style={{ paddingVertical: 6 }}>
        <Row
          icon={<Plug size={19} color={C.accent} />}
          title="Monday.com connection"
          desc="API token, board IDs and column IDs for the schedule & applicants boards"
          onPress={() => router.push('/settings/monday')}
          badge={mondayOk ? <Chip label="Configured" tone="good" /> : <Chip label="Needs setup" tone="warn" />}
        />
        <View style={styles.rowLine} />
        <Row
          icon={<Building2 size={19} color={C.accent} />}
          title="Properties"
          desc="Add or import properties and build their structure — units, rooms, kitchens, bathrooms"
          onPress={() => router.push('/settings/properties')}
          badge={propCount > 0 ? <Chip label={`${propCount} saved`} tone="neutral" /> : undefined}
        />
        <View style={styles.rowLine} />
        <Row
          icon={<Mail size={19} color={C.accent} />}
          title="Report & email"
          desc="Who each report goes to, your name and company name"
          onPress={() => router.push('/settings/report')}
          badge={emailsSet ? <Chip label="Set" tone="good" /> : undefined}
        />
        <View style={styles.rowLine} />
        <Row
          icon={<PoundSterling size={19} color={C.accent} />}
          title="Accounts & rates"
          desc="Pay per mile, tolls and charges, and the set items you install"
          onPress={() => router.push('/settings/accounts')}
          badge={rateLabel ? <Chip label={rateLabel} tone="neutral" /> : undefined}
        />
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Database size={17} color={C.sub} />
          <Text style={styles.aboutTitle}>About your data</Text>
        </View>
        <Text style={styles.aboutBody}>
          Properties, routines, mileage and reminders are stored on this device. Applicant notes and statuses
          are written straight to Monday.com. Your API token never leaves this device.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
  rowDesc: { fontSize: 12.5, color: C.sub, marginTop: 2, lineHeight: 17 },
  rowLine: { height: 1, backgroundColor: C.line },
  aboutTitle: { fontSize: 14, fontWeight: '800', color: C.ink },
  aboutBody: { fontSize: 12.5, color: C.sub, lineHeight: 19 },
});
