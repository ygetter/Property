import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, ScrollView, StyleSheet, Alert, Platform, Pressable } from 'react-native';
import { Plug, CheckCircle2, AlertTriangle, HelpCircle, Check, Search } from 'lucide-react-native';
import { C } from '../../lib/theme';
import { Card, SectionTitle, Input, Btn, Chip } from '../../components/ui';
import { store, DEFAULT_MONDAY } from '../../lib/storage';
import { MondaySettings } from '../../lib/types';
import { testConnection, MondayError } from '../../lib/monday';

export default function MondaySetup() {
  const router = useRouter();
  const [s, setS] = useState<MondaySettings>(DEFAULT_MONDAY);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [testOk, setTestOk] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    store.getMonday().then(setS);
  }, []);

  const set = (k: keyof MondaySettings) => (v: string) => {
    setS((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  };

  const save = async () => {
    await store.setMonday(s);
    setSaved(true);
  };

  const test = async () => {
    setTesting(true);
    setTestResult('');
    try {
      await store.setMonday(s);
      const msg = await testConnection(s);
      setTestResult(msg);
      setTestOk(true);
    } catch (e: any) {
      setTestResult(e instanceof MondayError ? e.message : 'Connection failed.');
      setTestOk(false);
    } finally {
      setTesting(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">

      <Card style={{ backgroundColor: C.navy, borderColor: C.navy }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <HelpCircle size={18} color="#F0A266" />
          <Text style={styles.helpTitle}>How to find these values</Text>
        </View>
        <Text style={styles.helpBody}>
          1. API token: Monday.com → your avatar → Developers → My Access Tokens.{'\n'}
          2. Board ID: open the board — the number in the URL, e.g. monday.com/boards/123456789.{'\n'}
          3. Column ID: on the board, click the column header ⋮ menu → “Column ID”, or enable Developer mode in Monday Labs to see them.
        </Text>
      </Card>

      <SectionTitle>Connection</SectionTitle>
      <Card>
        <Input label="API token" value={s.apiToken} onChangeText={set('apiToken')} placeholder="eyJhbGciOi…" autoCapitalize="none" autoCorrect={false} secureTextEntry={Platform.OS !== 'web'} />
        {Platform.OS === 'web' && (
          <Input label="CORS proxy (web only, optional)" value={s.corsProxy} onChangeText={set('corsProxy')}
            placeholder="e.g. https://corsproxy.io/?url=" autoCapitalize="none" />
        )}
        <Btn label={testing ? 'Testing…' : 'Test connection'} loading={testing} onPress={test} icon={<Plug size={15} color="#fff" />} />
        {testResult ? (
          <View style={[styles.testBox, { backgroundColor: testOk ? C.goodSoft : C.badSoft }]}>
            {testOk ? <CheckCircle2 size={16} color={C.good} /> : <AlertTriangle size={16} color={C.bad} />}
            <Text style={{ color: testOk ? C.good : C.bad, fontSize: 13, fontWeight: '600', flex: 1 }}>{testResult}</Text>
          </View>
        ) : null}
      </Card>

      <SectionTitle>Schedule board</SectionTitle>
      <Card>
        <Input label="Board ID" value={s.scheduleBoardId} onChangeText={set('scheduleBoardId')} placeholder="e.g. 1234567890" keyboardType="numeric" />
        <Input label="Task type column ID (Viewing / Inspection…)" value={s.scheduleTaskTypeCol} onChangeText={set('scheduleTaskTypeCol')} placeholder="e.g. text__1" autoCapitalize="none" />
        <Input label="Date & time column ID" value={s.scheduleDateCol} onChangeText={set('scheduleDateCol')} placeholder="e.g. date" autoCapitalize="none" />
        <Input label="Status column ID (Complete / No show…)" value={s.scheduleStatusCol} onChangeText={set('scheduleStatusCol')} placeholder="e.g. status" autoCapitalize="none" />
        <Input label="Applicants column ID (linked to applicants board)" value={s.scheduleApplicantsCol} onChangeText={set('scheduleApplicantsCol')} placeholder="e.g. board_relation" autoCapitalize="none" />
        <Text style={styles.fieldHint}>
          The linked column holding who said they would attend. Those names show under each viewing so you can tap to mark them attended, and anyone not marked appears in the daily report as a no-show.
        </Text>
        <Btn label="Find the applicants column for me" kind="soft" small icon={<Search size={14} color={C.accent} />}
          onPress={async () => { await store.setMonday(s); router.push('/settings/monday-columns'); }} />
        <Text style={styles.fieldHint}>
          Not sure of the ID? This reads your board and shows what every column contains, then sets it for you.
          The app also auto-detects the column and checks the applicants board the other way round, so leave it
          blank if you would rather it worked that out itself.
        </Text>

        <Input label="Rows to load" value={String(s.scheduleFetchLimit ?? 85)}
          onChangeText={(v) => { setS((p) => ({ ...p, scheduleFetchLimit: Number(v.replace(/[^\d]/g, '')) || 0 })); setSaved(false); }}
          placeholder="85" keyboardType="numeric" />
        <Text style={styles.fieldHint}>
          Only the top rows of the board are loaded, which keeps the app fast. The most recent entries sit at the top — raise this if a viewing is missing.
        </Text>

        <Pressable onPress={() => { setS((p) => ({ ...p, timesAreUtc: !p.timesAreUtc })); setSaved(false); }}
          style={styles.toggleRow}>
          <View style={[styles.toggleBox, s.timesAreUtc && styles.toggleBoxOn]}>
            {s.timesAreUtc && <Check size={13} color="#fff" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Convert times from UTC to my local time</Text>
            <Text style={styles.fieldHint}>
              Monday.com stores times in UTC, so during British Summer Time an 11:00 viewing arrives as 10:00. Keep this on. Turn it off only if times then show an hour late.
            </Text>
          </View>
        </Pressable>
      </Card>

      <SectionTitle>Applicants board</SectionTitle>
      <Card>
        <Input label="Board ID" value={s.applicantsBoardId} onChangeText={set('applicantsBoardId')} placeholder="e.g. 9876543210" keyboardType="numeric" />
        <Input label="Email column ID" value={s.applicantsEmailCol} onChangeText={set('applicantsEmailCol')} placeholder="e.g. email" autoCapitalize="none" />
        <Input label="Mobile column ID" value={s.applicantsMobileCol} onChangeText={set('applicantsMobileCol')} placeholder="e.g. phone" autoCapitalize="none" />
        <Input label="Viewing status column ID" value={s.applicantsStatusCol} onChangeText={set('applicantsStatusCol')} placeholder="e.g. status__1" autoCapitalize="none" />
        <Input label="Viewing notes column ID" value={s.applicantsNotesCol} onChangeText={set('applicantsNotesCol')} placeholder="e.g. long_text" autoCapitalize="none" />
        <Text style={styles.fieldHint}>
          Searching looks across the entire board by name, email and mobile. New applicants you add are always created in the “To Check” group.
        </Text>
      </Card>

      <Btn label={saved ? 'Saved ✓' : 'Save settings'} onPress={save} kind={saved ? 'ghost' : 'primary'} />
      {Platform.OS === 'web' && (
        <Text style={styles.webNote}>
          Browsers block direct calls to Monday.com (CORS). In the compiled Android app it works directly — for the web version, enter a CORS proxy above.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  helpTitle: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  helpBody: { color: '#C3CDD9', fontSize: 12.5, lineHeight: 20 },
  testBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 10, marginTop: 12 },
  fieldHint: { fontSize: 11.5, color: C.faint, lineHeight: 17, marginTop: -6, marginBottom: 12 },
  toggleRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 2 },
  toggleBox: { width: 21, height: 21, borderRadius: 6, borderWidth: 1.6, borderColor: C.line, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  toggleBoxOn: { backgroundColor: C.accent, borderColor: C.accent },
  toggleLabel: { fontSize: 13.5, fontWeight: '700', color: C.ink, marginBottom: 3 },
  webNote: { fontSize: 12, color: C.sub, lineHeight: 18, marginTop: 14, textAlign: 'center' },
});
