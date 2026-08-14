import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, Alert, Platform, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  CalendarCheck, ChevronRight, Clock, RefreshCw, FileText, Send,
  CheckCircle2, UserX, CalendarClock, Users, Search,
} from 'lucide-react-native';
import { C } from '../../lib/theme';
import { Card, SectionTitle, Chip, Empty, Btn } from '../../components/ui';
import { store } from '../../lib/storage';
import { fetchSchedule, setScheduleStatus, fetchApplicantsByIds, MondayError, getExpectedSource } from '../../lib/monday';
import { ScheduleItem, MondaySettings, ReportSettings, ViewingAttendee, TASK_STATUSES } from '../../lib/types';
import { groupViewings, todayStr, friendlyDate, normName, GroupedViewing } from '../../lib/grouping';
import { buildReportHtml, generatePdf, sharePdf, emailReport, ReportViewing } from '../../lib/report';

export default function Viewings() {
  const expectedSource = getExpectedSource();
  const router = useRouter();
  const [settings, setSettings] = useState<MondaySettings | null>(null);
  const [report, setReport] = useState<ReportSettings | null>(null);
  const [groups, setGroups] = useState<GroupedViewing[]>([]);
  const [attendance, setAttendance] = useState<Record<string, ViewingAttendee[]>>({});
  const [statusOverride, setStatusOverride] = useState<Record<string, string>>({});
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reporting, setReporting] = useState(false);

  const load = useCallback(async () => {
    const s = await store.getMonday();
    const r = await store.getReport();
    const att = await store.getAttendance();
    setSettings(s);
    setReport(r);
    setAttendance(att);
    setError('');
    if (!s.apiToken || !s.scheduleBoardId) return;
    setLoading(true);
    try {
      const items: ScheduleItem[] = await fetchSchedule(s);
      const today = todayStr();
      const viewings = items.filter(
        (i) => i.date === today && i.taskType.toLowerCase().includes('viewing'),
      );
      const grouped = groupViewings(viewings);
      setGroups(grouped);
      setStatusOverride({});
      // Cache who is expected at each viewing so the viewing screen always has
      // the names, even when reopened later or after a reload
      const cache = await store.getExpected();
      for (const g of grouped) cache[g.key] = g.expected;
      await store.setExpected(cache);
    } catch (e: any) {
      setError(e instanceof MondayError ? e.message : 'Could not load viewings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const configured = !!(settings?.apiToken && settings?.scheduleBoardId);

  // Write the task status back to every schedule row merged into this viewing
  const markStatus = async (g: GroupedViewing, status: string) => {
    if (!settings) return;
    setStatusBusy(g.key);
    try {
      for (const item of g.items) {
        await setScheduleStatus(settings, item.id, status);
      }
      setStatusOverride((p) => ({ ...p, [g.key]: status }));
    } catch (e: any) {
      Alert.alert('Could not update status', e?.message || 'Monday.com error');
    } finally {
      setStatusBusy(null);
    }
  };

  // Match the board's label loosely so "No show" / "NO SHOW" still light up the button
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const statusOf = (g: GroupedViewing) => {
    const raw = statusOverride[g.key] ?? g.status ?? '';
    const match = TASK_STATUSES.find((t) => norm(t) === norm(raw));
    return match || raw;
  };

  const makeReport = async () => {
    if (groups.length === 0) {
      Alert.alert('No viewings', 'There are no viewings recorded today to report on.');
      return;
    }
    setReporting(true);
    try {
      const today = todayStr();

      // Work out who was expected but did not attend, and pull their contact details
      // (matched on Monday ID where we have one, otherwise on the name, so a
      // person added by name still counts as attended)
      const attendedIds = new Set(
        groups.flatMap((g) => (attendance[g.key] || []).map((a) => a.applicantId)),
      );
      const attendedNames = new Set(
        groups.flatMap((g) => (attendance[g.key] || []).map((a) => normName(a.name))),
      );
      const didAttend = (e: { id: string; name: string }) =>
        (e.id && attendedIds.has(e.id)) || attendedNames.has(normName(e.name));
      const missingIds = Array.from(new Set(
        groups.flatMap((g) => g.expected.filter((e) => e.id && !didAttend(e)).map((e) => e.id)),
      ));
      let details: Record<string, { email: string; mobile: string; group: string; name: string }> = {};
      if (missingIds.length && settings) {
        try {
          const full = await fetchApplicantsByIds(settings, missingIds);
          details = Object.fromEntries(full.map((f) => [f.id, { email: f.email, mobile: f.mobile, group: f.group, name: f.name }]));
        } catch { /* report still works without extra details */ }
      }

      const payload: ReportViewing[] = groups.map((g) => {
        const attendees = attendance[g.key] || [];
        const seenIds = new Set(attendees.map((a) => a.applicantId));
        const seenNames = new Set(attendees.map((a) => normName(a.name)));
        const noShows = g.expected
          .filter((e) => !((e.id && seenIds.has(e.id)) || seenNames.has(normName(e.name))))
          .map((e) => ({
            id: e.id,
            name: details[e.id]?.name || e.name,
            email: details[e.id]?.email || '',
            mobile: details[e.id]?.mobile || '',
            group: details[e.id]?.group || '',
          }));
        return { group: g, attendees, expected: g.expected, noShows, status: statusOf(g) };
      });

      const html = buildReportHtml(today, payload,
        report || { recipientEmails: '', senderName: '', companyName: '', mileageEmails: '', costsEmails: '', metersEmails: '', ccEmails: '' });

      const { uri } = await generatePdf(html, `viewings-${today}.pdf`);
      const to = report?.recipientEmails || '';
      const subject = `Daily Viewings Report — ${friendlyDate(today)}`;
      const totalNo = payload.reduce((n, p) => n + (p.noShows?.length || 0), 0);
      const body = `Hi,\n\nPlease find attached today's viewings report (${friendlyDate(today)}).\n\n`
        + `Viewings: ${groups.length}\nApplicants seen: ${payload.reduce((n, p) => n + p.attendees.length, 0)}\n`
        + `Did not attend: ${totalNo}\n\nKind regards,\n${report?.senderName || ''}`;

      if (Platform.OS === 'web') {
        if (to) await emailReport({ to, cc: report?.ccEmails, subject, body: body + '\n\n(Attach the PDF you just saved.)' });
        Alert.alert('Report ready', 'The print dialog opened — choose "Save as PDF". An email draft has also been opened; attach the PDF before sending.');
      } else if (uri) {
        if (to) await emailReport({ to, cc: report?.ccEmails, subject, body, attachmentUri: uri });
        else await sharePdf(uri);
      }
    } catch (e: any) {
      Alert.alert('Report failed', e?.message || 'Something went wrong generating the report.');
    } finally {
      setReporting(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.accent} />}>

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.h1}>Today's viewings</Text>
          <Text style={styles.h2}>{friendlyDate(todayStr())} · {groups.length} viewing{groups.length === 1 ? '' : 's'}</Text>
        </View>
        <Pressable onPress={load} style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.6 }]}>
          <RefreshCw size={17} color={C.sub} />
        </Pressable>
      </View>

      {!configured && (
        <Card style={{ borderColor: C.accent, backgroundColor: C.accentSoft }}>
          <Text style={styles.setupTitle}>Monday.com not connected</Text>
          <Text style={styles.setupBody}>Add your API token, schedule board ID and column IDs in Settings to pull today's viewings automatically.</Text>
          <Btn label="Open setup" small onPress={() => router.push('/settings/monday')} />
        </Card>
      )}

      {error ? (
        <Card style={{ borderColor: C.bad, backgroundColor: C.badSoft }}>
          <Text style={{ color: C.bad, fontWeight: '600', fontSize: 13, marginBottom: 10 }}>{error}</Text>
          <Btn label="Retry" small kind="danger" onPress={load} />
        </Card>
      ) : null}

      {configured && groups.length === 0 && !loading && !error && (
        <Card>
          <Empty icon={<CalendarCheck size={28} color={C.faint} />} title="No viewings today"
            body="No schedule items with task type “Viewing” for today. Pull down to refresh." />
        </Card>
      )}

      {configured && groups.length > 0 && !loading && groups.every((g) => g.expected.length === 0) && (
        <Card style={{ borderColor: C.accent, backgroundColor: C.accentSoft }}>
          <Text style={styles.setupTitle}>No applicant names came back</Text>
          <Text style={styles.setupBody}>
            The app tried the Applicants column you set, every other column on the schedule board, and the
            applicants board the other way round.{expectedSource ? ' Last check: ' + expectedSource + '.' : ''}
          </Text>
          <Btn label="Find the applicants column" small icon={<Search size={14} color="#fff" />}
            onPress={() => router.push('/settings/monday-columns')} />
        </Card>
      )}

      {groups.map((g) => {
        const attendees = attendance[g.key] || [];
        const count = attendees.length;
        const current = statusOf(g);
        return (
          <View key={g.key} style={styles.viewingCard}>
            <View style={styles.viewingTop}>
              <View style={styles.timePill}>
                <Clock size={13} color={C.accent} />
                <Text style={styles.timeText}>{g.time || '—'}</Text>
              </View>
              {g.items.length > 1 && <Chip label={`${g.items.length} units`} tone="accent" />}
              {count > 0 && <Chip label={`${count} attended`} tone="good" />}
              {current ? <Chip label={current} tone={current === 'Complete' ? 'good' : current === 'No Show' ? 'bad' : 'warn'} /> : null}
            </View>

            <Text style={styles.viewingAddr}>{g.display}</Text>

            {/* How many applicants are expected — the names are inside the viewing */}
            {g.expected.length > 0 && (
              <View style={styles.expectedRow}>
                <Users size={13} color={C.sub} />
                <Text style={styles.expectedTitle}>
                  {g.expected.length} expected{count > 0 ? ` · ${count} added` : ''}
                </Text>
              </View>
            )}

            {/* Task status → schedule board */}
            <View style={styles.taskRow}>
              {TASK_STATUSES.map((s) => {
                const on = current === s;
                const Icon = s === 'Complete' ? CheckCircle2 : s === 'No Show' ? UserX : CalendarClock;
                return (
                  <Pressable key={s} onPress={() => markStatus(g, s)} disabled={statusBusy === g.key}
                    style={({ pressed }) => [
                      styles.taskBtn,
                      on && (s === 'Complete' ? styles.taskOnGood : s === 'No Show' ? styles.taskOnBad : styles.taskOnWarn),
                      pressed && { opacity: 0.7 },
                    ]}>
                    <Icon size={13} color={on ? '#fff' : s === 'Complete' ? C.good : s === 'No Show' ? C.bad : C.warn} />
                    <Text style={[styles.taskBtnText, on && { color: '#fff' }]}>{s}</Text>
                  </Pressable>
                );
              })}
              {statusBusy === g.key && <ActivityIndicator size="small" color={C.accent} />}
            </View>

            <Pressable onPress={() => router.push({
              pathname: '/viewing/[key]',
              params: { key: g.key, expected: encodeURIComponent(JSON.stringify(g.expected)) },
            })} style={({ pressed }) => [styles.openBtn, pressed && { opacity: 0.85 }]}>
              <Text style={styles.openText}>Open viewing</Text>
              <ChevronRight size={16} color="#fff" />
            </Pressable>
          </View>
        );
      })}

      <SectionTitle>End of day</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <FileText size={20} color={C.accent} />
          <Text style={styles.reportTitle}>Daily report</Text>
        </View>
        <Text style={styles.reportBody}>
          A clean PDF of today's viewings — every applicant, outcome and note, plus a follow-up list of everyone who was expected but did not attend with their contact details
          {report?.recipientEmails ? `, emailed to ${report.recipientEmails}.` : '. Set recipient emails in Settings to send it automatically.'}
        </Text>
        <Btn label="Generate & email report" loading={reporting} onPress={makeReport} icon={<Send size={15} color="#fff" />} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  h1: { fontSize: 26, fontWeight: '800', color: C.ink, letterSpacing: -0.4 },
  h2: { fontSize: 13.5, color: C.sub, marginTop: 2, fontWeight: '500' },
  refreshBtn: { padding: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  setupTitle: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 4 },
  setupBody: { fontSize: 13, color: C.sub, lineHeight: 19, marginBottom: 12 },
  viewingCard: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16, marginBottom: 12 },
  viewingTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  timePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.accentSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  timeText: { fontSize: 13, fontWeight: '800', color: C.accent, fontVariant: ['tabular-nums'] },
  viewingAddr: { fontSize: 16.5, fontWeight: '700', color: C.ink, lineHeight: 23, marginBottom: 12 },
  expectedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  expectedHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  expectedTitle: { fontSize: 11, fontWeight: '800', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.8 },
  expectedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  nameTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 99, paddingVertical: 6, paddingHorizontal: 11 },
  nameTagOn: { backgroundColor: C.goodSoft, borderColor: C.goodSoft },
  nameTagText: { fontSize: 13, fontWeight: '600', color: C.ink },
  taskRow: { flexDirection: 'row', gap: 7, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' },
  taskBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: C.line, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 11, backgroundColor: '#fff' },
  taskBtnText: { fontSize: 12.5, fontWeight: '700', color: C.ink },
  taskOnGood: { backgroundColor: C.good, borderColor: C.good },
  taskOnBad: { backgroundColor: C.bad, borderColor: C.bad },
  taskOnWarn: { backgroundColor: C.warn, borderColor: C.warn },
  openBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.navy, borderRadius: 9, paddingVertical: 11 },
  openText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  reportTitle: { fontSize: 16, fontWeight: '800', color: C.ink },
  reportBody: { fontSize: 13, color: C.sub, lineHeight: 19, marginBottom: 14 },
});
