import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Building2, Plus, FileUp, ChevronRight, Trash2, Home, MapPin } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { C } from '../../lib/theme';
import { Card, SectionTitle, Chip, Btn, Empty } from '../../components/ui';
import { store, uid } from '../../lib/storage';
import { Property, PropertyUnit } from '../../lib/types';
import { lookupPostcode } from '../../lib/location';

const PROPERTY_TYPES: Property['type'][] = ['HMO', 'House', 'Flats', 'Studio', 'Flat', 'Other'];

function parseType(v: string): Property['type'] {
  const t = (v || '').toLowerCase();
  if (t.includes('hmo')) return 'HMO';
  if (t.includes('flat')) return 'Flat';
  if (t.includes('house')) return 'House';
  if (t.includes('studio')) return 'Studio';
  return 'Other';
}

export default function Properties() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [importing, setImporting] = useState(false);
  const [locating, setLocating] = useState(false);

  const load = useCallback(async () => {
    setProperties(await store.getProperties());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const persist = async (next: Property[]) => {
    setProperties(next);
    await store.setProperties(next);
  };

  const countUnits = (units: PropertyUnit[]): number =>
    units.reduce((n, u) => n + 1 + countUnits(u.children), 0);

  const deleteProperty = (id: string) => {
    Alert.alert('Remove property?', 'This removes it from this device only.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => persist(properties.filter((p) => p.id !== id)) },
    ]);
  };

  const importFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'text/comma-separated-values',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      setImporting(true);
      const asset = res.assets[0];
      let wb: XLSX.WorkBook;
      if (Platform.OS === 'web') {
        const buf = await fetch(asset.uri).then((r) => r.arrayBuffer());
        wb = XLSX.read(buf, { type: 'array' });
      } else {
        const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        wb = XLSX.read(b64, { type: 'base64' });
      }
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (rows.length === 0) {
        Alert.alert('Empty file', 'No rows found in the first sheet.');
        return;
      }
      const imported: Property[] = rows.map((row) => {
        const get = (...keys: string[]) => {
          for (const k of keys) {
            const found = Object.keys(row).find((rk) => rk.toLowerCase().trim() === k);
            if (found) return String(row[found]).trim();
          }
          return '';
        };
        const address = get('address', 'property', 'property address');
        const postcode = get('postcode', 'post code', 'postal code', 'zip');
        const type = parseType(get('type', 'property type'));
        const unitCount = Math.max(0, parseInt(get('units', 'no of units', 'number of units', 'beds', 'rooms')) || 0);
        const kitchens = Math.max(0, parseInt(get('kitchens', 'no of kitchens')) || 0);
        const bathrooms = Math.max(0, parseInt(get('bathrooms', 'no of bathrooms')) || 0);
        const notes = get('notes', 'note');
        const units: PropertyUnit[] = Array.from({ length: unitCount }, (_, i) => ({
          id: uid(),
          label: type === 'HMO' ? `Room ${i + 1}` : `Unit ${i + 1}`,
          kind: type === 'HMO' ? 'hmo-room' : type === 'Flat' || type === 'Flats' ? 'flat' : 'other',
          ensuite: false,
          kitchens: type === 'Flats' ? 1 : 0,
          bathrooms: type === 'Flats' ? 1 : 0,
          children: [],
        }));
        return {
          id: uid(), address: address || 'Unnamed property', postcode, type,
          kitchens, bathrooms, notes, units, createdAt: Date.now(),
        };
      }).filter((p) => p.address !== 'Unnamed property');

      if (imported.length === 0) {
        Alert.alert('Nothing imported', 'Make sure the file has an "Address" column. Optional columns: Postcode, Type, Units, Kitchens, Bathrooms, Notes.');
        return;
      }
      await persist([...properties, ...imported]);
      Alert.alert('Import complete', `${imported.length} propert${imported.length === 1 ? 'y' : 'ies'} added. Tap any property to refine its structure.`);
    } catch (e: any) {
      Alert.alert('Import failed', e?.message || 'Could not read that file.');
    } finally {
      setImporting(false);
    }
  };

  // Fill in the map location for every property that has a postcode but no
  // location yet — so “Nearby properties” works without editing each one.
  const locateAll = async () => {
    const todo = properties.filter((p) => p.postcode.trim() && typeof p.lat !== 'number');
    if (todo.length === 0) {
      Alert.alert('Nothing to do', 'Every property with a postcode already has a location saved.');
      return;
    }
    setLocating(true);
    let done = 0;
    const failed: string[] = [];
    const next = [...properties];
    for (const p of todo) {
      try {
        const c = await lookupPostcode(p.postcode);
        const i = next.findIndex((x) => x.id === p.id);
        if (i >= 0) next[i] = { ...next[i], lat: c.lat, lng: c.lng, locationSource: 'Postcode' };
        done++;
      } catch {
        failed.push(p.postcode || p.address);
      }
    }
    await persist(next);
    setLocating(false);
    Alert.alert('Locations updated',
      `${done} propert${done === 1 ? 'y' : 'ies'} located from their postcode.`
      + (failed.length ? `\n\nCouldn't find: ${failed.slice(0, 6).join(', ')}${failed.length > 6 ? '…' : ''}` : ''));
  };

  const missingLoc = properties.filter((p) => typeof p.lat !== 'number').length;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <View style={styles.btnRow}>
        <View style={{ flex: 1 }}>
          <Btn label="Add property" onPress={() => router.push({ pathname: '/settings/property-edit', params: {} })} icon={<Plus size={15} color="#fff" />} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn label="Import Excel / CSV" kind="ghost" loading={importing} onPress={importFile} icon={<FileUp size={15} color={C.ink} />} />
        </View>
      </View>
      <Text style={styles.importHint}>
        Import expects columns: Address (required), Postcode, Type, Units, Kitchens, Bathrooms, Notes.
        From Google Sheets: File → Download → .xlsx, then import here.
      </Text>

      {missingLoc > 0 && properties.length > 0 && (
        <Card style={{ borderColor: C.accent, backgroundColor: C.accentSoft }}>
          <Text style={styles.locCardTitle}>{missingLoc} propert{missingLoc === 1 ? 'y has' : 'ies have'} no map location</Text>
          <Text style={styles.locCardBody}>
            Locations power the “Nearby properties” list on the home screen. Look them all up from their
            postcodes in one go, or open a property to set it by hand.
          </Text>
          <Btn label="Find locations from postcodes" small loading={locating} onPress={locateAll}
            icon={<MapPin size={14} color="#fff" />} />
        </Card>
      )}

      <SectionTitle>Saved properties ({properties.length})</SectionTitle>
      {properties.length === 0 && (
        <Card>
          <Empty icon={<Building2 size={26} color={C.faint} />} title="No properties yet"
            body="Add properties manually or import from a spreadsheet, then build each one's structure — units, rooms, kitchens and bathrooms." />
        </Card>
      )}
      {properties.map((p) => (
        <Pressable key={p.id} onPress={() => router.push({ pathname: '/settings/property-edit', params: { id: p.id } })}
          style={({ pressed }) => [styles.propCard, pressed && { opacity: 0.8 }]}>
          <View style={styles.propIcon}>
            <Home size={18} color={C.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.propAddr}>{p.address}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              <Chip label={p.type} tone="info" />
              {p.units.length > 0 && <Chip label={`${countUnits(p.units)} unit${countUnits(p.units) === 1 ? '' : 's'}`} tone="neutral" />}
              {p.kitchens > 0 && <Chip label={`${p.kitchens} kitchen${p.kitchens === 1 ? '' : 's'}`} tone="neutral" />}
              {p.postcode ? <Chip label={p.postcode} tone="neutral" /> : null}
              {typeof p.lat === 'number'
                ? <Chip label="Located" tone="good" />
                : <Chip label="No location" tone="warn" />}
            </View>
          </View>
          <Pressable onPress={() => deleteProperty(p.id)} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.5 }}>
            <Trash2 size={16} color={C.faint} />
          </Pressable>
          <ChevronRight size={17} color={C.faint} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  importHint: { fontSize: 12, color: C.faint, lineHeight: 17, marginTop: 10, marginBottom: 4, paddingHorizontal: 4 },
  propCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 10 },
  propIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  propAddr: { fontSize: 14.5, fontWeight: '700', color: C.ink, lineHeight: 20 },
  locCardTitle: { fontSize: 14, fontWeight: '800', color: C.ink, marginBottom: 4 },
  locCardBody: { fontSize: 12.5, color: C.sub, lineHeight: 18, marginBottom: 12 },
});
