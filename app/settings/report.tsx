import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { Mail, Info } from 'lucide-react-native';
import { C } from '../../lib/theme';
import { Card, SectionTitle, Input, Btn } from '../../components/ui';
import { store, DEFAULT_REPORT } from '../../lib/storage';
import { ReportSettings } from '../../lib/types';

export default function ReportSetup() {
  const [s, setS] = useState<ReportSettings>(DEFAULT_REPORT);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    store.getReport().then(setS);
  }, []);

  const set = (k: keyof ReportSettings) => (v: string) => {
    setS((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  };

  const save = async () => {
    await store.setReport(s);
    setSaved(true);
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <SectionTitle>Who you are</SectionTitle>
      <Card>
        <Input label="Your name (shown on reports & signed at the end of emails)" value={s.senderName} onChangeText={set('senderName')} placeholder="e.g. Yidel Getter" />
        <Input label="Company name (optional)" value={s.companyName} onChangeText={set('companyName')} placeholder="e.g. ABC Property Management" />
      </Card>

      <SectionTitle>Where each report goes</SectionTitle>
      <Card>
        <Input label="Daily viewings report" value={s.recipientEmails} onChangeText={set('recipientEmails')}
          placeholder="manager@company.co.uk, office@company.co.uk" autoCapitalize="none" keyboardType="email-address" />
        <Input label="Mileage & charges report" value={s.mileageEmails} onChangeText={set('mileageEmails')}
          placeholder="Leave blank to use the viewings recipients" autoCapitalize="none" keyboardType="email-address" />
        <Input label="Costs & receipts (accountant)" value={s.costsEmails} onChangeText={set('costsEmails')}
          placeholder="accountant@company.co.uk" autoCapitalize="none" keyboardType="email-address" />
        <Input label="Meter readings" value={s.metersEmails} onChangeText={set('metersEmails')}
          placeholder="office@company.co.uk" autoCapitalize="none" keyboardType="email-address" />
        <Input label="Always CC (optional)" value={s.ccEmails} onChangeText={set('ccEmails')}
          placeholder="you@company.co.uk" autoCapitalize="none" keyboardType="email-address" />
        <Btn label={saved ? 'Saved ✓' : 'Save'} kind={saved ? 'ghost' : 'primary'} onPress={save} />
      </Card>

      <SectionTitle>How sending works</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
          <Mail size={18} color={C.accent} />
          <Text style={styles.h}>Sent from your own email address</Text>
        </View>
        <Text style={styles.note}>
          Every “email” button in the app builds the PDF or gathers the photos, then opens your phone's email app
          with the recipients, subject, message and attachments already filled in. You just check it and press send,
          so the email comes from your own address — nothing is sent behind your back.
        </Text>
        <View style={styles.tipBox}>
          <Info size={15} color={C.sub} />
          <Text style={styles.tip}>
            {Platform.OS === 'web'
              ? 'In this browser preview, the print dialog opens for the PDF and a blank email draft opens separately — attachments only work in the installed Android app.'
              : 'Make sure Gmail (or Outlook) is installed and signed in on this phone, and set as your default mail app.'}
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h: { flex: 1, fontSize: 14.5, fontWeight: '800', color: C.ink },
  note: { fontSize: 12.5, color: C.sub, lineHeight: 19 },
  tipBox: { flexDirection: 'row', gap: 9, backgroundColor: C.bg, borderRadius: 9, padding: 11, marginTop: 11 },
  tip: { flex: 1, fontSize: 12, color: C.sub, lineHeight: 18 },
});
