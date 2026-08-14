import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Linking, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { MapPin, Navigation, Home as HomeIcon, ChevronRight, Crosshair, Settings } from 'lucide-react-native';
import { C } from '../lib/theme';
import { Card, SectionTitle, Chip, Btn, Empty } from '../components/ui';
import { store } from '../lib/storage';
import { Property } from '../lib/types';
import { Coords, currentPosition, distanceMiles, milesLabel } from '../lib/location';

const RADII = [1, 3, 5, 10, 0] as const; // 0 = show everything

export default function Nearby() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [me, setMe] = useState<Coords | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [radius, setRadius] = useState<number>(5);

  const load = useCallback(async () => {
    setProperties(await store.getProperties());
    setBusy(true);
    setError('');
    try {
      setMe(await currentPosition());
    } catch (e: any) {
      setError(e?.message || 'Could not get your location.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const located = properties.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
  const withoutLocation = properties.length - located.length;

  const ranked = me
    ? located
        .map((p) => ({ p, miles: distanceMiles(me, { lat: p.lat!, lng: p.lng! }) }))
        .sort((a, b) => a.miles - b.miles)
    : [];
  const shown = radius === 0 ? ranked : ranked.filter((r) => r.miles <= radius);

  const openDirections = (p: Property) => {
    const dest = `${p.lat},${p.lng}`;
    const label = encodeURIComponent(p.address);
    const url = `https://www.google.com/maps/dir/?api=1&destination=${dest}&destination_place_id=&travelmode=driving&dir_action=navigate&q=${label}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <ScrollView style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={C.accent} />}>
      <Stack.Screen options={{ title: 'Nearby Properties' }} />

      <Text style={styles.lead}>
        Properties closest to where you are right now — handy when a job finishes early and you have time to spare.
      </Text>

      {busy && !me && (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={C.accent} />
            <Text style={styles.muted}>Finding your location…</Text>
          </View>
        </Card>
      )}

      {error ? (
        <Card style={{ borderColor: C.bad, backgroundColor: C.badSoft }}>
          <Text style={styles.errText}>{error}</Text>
          <Btn label="Try again" small kind="danger" onPress={load} icon={<Crosshair size={14} color={C.bad} />} />
        </Card>
      ) : null}

      {me && (
        <>
          <View style={styles.radiusRow}>
            {RADII.map((r) => (
              <Pressable key={r} onPress={() => setRadius(r)}
                style={[styles.radiusBtn, radius === r && styles.radiusBtnOn]}>
                <Text style={[styles.radiusText, radius === r && { color: '#fff' }]}>
                  {r === 0 ? 'All' : `${r} mi`}
                </Text>
              </Pressable>
            ))}
          </View>

          <SectionTitle right={<Text style={styles.muted}>{shown.length} of {located.length}</Text>}>
            {radius === 0 ? 'All properties by distance' : `Within ${radius} mile${radius === 1 ? '' : 's'}`}
          </SectionTitle>

          {shown.length === 0 && (
            <Card>
              <Empty icon={<MapPin size={26} color={C.faint} />}
                title={located.length === 0 ? 'No property locations saved yet' : 'Nothing this close'}
                body={located.length === 0
                  ? 'Add locations to your properties in Settings → Properties, then come back here.'
                  : 'Try a wider distance using the buttons above.'} />
            </Card>
          )}

          {shown.map(({ p, miles }) => (
            <View key={p.id} style={styles.row}>
              <View style={styles.rowIcon}><HomeIcon size={18} color={C.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addr}>{p.address}</Text>
                <View style={styles.chipRow}>
                  <Chip label={milesLabel(miles)} tone="accent" />
                  <Chip label={p.type} tone="info" />
                  {p.postcode ? <Chip label={p.postcode} tone="neutral" /> : null}
                </View>
                <View style={styles.actions}>
                  <Pressable onPress={() => openDirections(p)}
                    style={({ pressed }) => [styles.actBtn, pressed && { opacity: 0.7 }]}>
                    <Navigation size={14} color={C.accent} />
                    <Text style={styles.actText}>Directions</Text>
                  </Pressable>
                  <Pressable onPress={() => router.push({ pathname: '/settings/property-edit', params: { id: p.id } })}
                    style={({ pressed }) => [styles.actBtn, pressed && { opacity: 0.7 }]}>
                    <Text style={[styles.actText, { color: C.navy }]}>Property details</Text>
                    <ChevronRight size={14} color={C.navy} />
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </>
      )}

      {withoutLocation > 0 && (
        <Card style={{ marginTop: 14 }}>
          <Text style={styles.missTitle}>
            {withoutLocation} propert{withoutLocation === 1 ? 'y' : 'ies'} not on the map yet
          </Text>
          <Text style={styles.muted}>
            They can be located automatically from their postcodes in one tap.
          </Text>
          <View style={{ marginTop: 12 }}>
            <Btn label="Open Properties" small kind="soft" icon={<Settings size={14} color={C.accent} />}
              onPress={() => router.push('/settings/properties')} />
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 13, color: C.sub, lineHeight: 19, marginBottom: 14 },
  muted: { fontSize: 12.5, color: C.sub },
  errText: { color: C.bad, fontWeight: '600', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  radiusRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  radiusBtn: { borderWidth: 1, borderColor: C.line, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: '#fff' },
  radiusBtnOn: { backgroundColor: C.accent, borderColor: C.accent },
  radiusText: { fontSize: 13, fontWeight: '700', color: C.ink },
  row: { flexDirection: 'row', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 10 },
  rowIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  addr: { fontSize: 14.5, fontWeight: '700', color: C.ink, lineHeight: 20 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: C.bg },
  actText: { fontSize: 12.5, fontWeight: '700', color: C.accent },
  missTitle: { fontSize: 14, fontWeight: '800', color: C.ink, marginBottom: 4 },
});
