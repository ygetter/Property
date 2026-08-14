import React, { useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, TextInputProps, ActivityIndicator, ViewStyle } from 'react-native';
import { C, S } from '../lib/theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Btn({
  label, onPress, kind = 'primary', icon, disabled, small, loading,
}: {
  label: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger' | 'soft';
  icon?: React.ReactNode; disabled?: boolean; small?: boolean; loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        kind === 'ghost' && styles.btnGhost,
        kind === 'danger' && styles.btnDanger,
        kind === 'soft' && styles.btnSoft,
        (pressed || disabled) && { opacity: 0.65 },
      ]}
    >
      {loading ? <ActivityIndicator color={kind === 'primary' ? '#fff' : C.accent} size="small" /> : (
        <>
          {icon}
          <Text style={[
            styles.btnLabel,
            small && styles.btnLabelSmall,
            kind === 'ghost' && { color: C.ink },
            kind === 'danger' && { color: C.bad },
            kind === 'soft' && { color: C.accent },
          ]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const { label, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={C.faint}
        style={styles.input}
        {...rest}
      />
    </View>
  );
}

/**
 * Search box where tapping ANYWHERE in the box focuses the input
 * (not just directly on the letters).
 */
export function SearchField({
  value, onChangeText, placeholder, icon, autoFocus,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  autoFocus?: boolean;
}) {
  const ref = useRef<TextInput>(null);
  return (
    <Pressable
      // Whole box is the tap target; on web it also shows a text cursor
      style={[styles.searchWrap, { cursor: 'text' } as any]}
      onPress={() => ref.current?.focus()}
    >
      {icon}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.faint}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        style={styles.searchInput}
      />
      {value.length > 0 && (
        <Pressable onPress={() => { onChangeText(''); ref.current?.focus(); }} hitSlop={10}>
          <Text style={styles.clearX}>✕</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'info' | 'accent' }) {
  const tones: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: '#EDF0F4', fg: '#44505E' },
    good: { bg: C.goodSoft, fg: '#177A4E' },
    bad: { bg: C.badSoft, fg: C.bad },
    warn: { bg: C.warnSoft, fg: C.warn },
    info: { bg: C.infoSoft, fg: C.info },
    accent: { bg: C.accentSoft, fg: C.accent },
  };
  const t = tones[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      <Text style={[styles.chipText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

export function Empty({ title, body, icon }: { title: string; body?: string; icon?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      {icon}
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: S.radius,
    borderWidth: 1,
    borderColor: C.line,
    padding: S.pad,
    marginBottom: 12,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 1 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.accent, borderRadius: S.radiusSm, paddingVertical: 13, paddingHorizontal: 18,
  },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line },
  btnDanger: { backgroundColor: C.badSoft },
  btnSoft: { backgroundColor: C.accentSoft },
  btnLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnLabelSmall: { fontSize: 13 },
  inputLabel: { fontSize: 12.5, fontWeight: '600', color: C.sub, marginBottom: 6 },
  input: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: S.radiusSm,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: C.ink,
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: S.radiusSm,
    paddingHorizontal: 13, paddingVertical: 4, minHeight: 46,
  },
  searchInput: {
    flex: 1, fontSize: 15, color: C.ink, paddingVertical: 11,
    ...({ outlineStyle: 'none' } as any),
  },
  clearX: { fontSize: 15, color: C.faint, paddingHorizontal: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, alignSelf: 'flex-start' },
  chipText: { fontSize: 11.5, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  emptyBody: { fontSize: 13, color: C.sub, textAlign: 'center', lineHeight: 19 },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 12 },
});
