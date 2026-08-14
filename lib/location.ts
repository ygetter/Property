import * as Location from 'expo-location';

export interface Coords {
  lat: number;
  lng: number;
}

/** Ask for permission (once) and read the phone's current position. */
export async function currentPosition(): Promise<Coords> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission was not given. Allow location access for Property Companion in your phone settings.');
  }
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

/**
 * Turn a UK postcode into coordinates using postcodes.io — a free public
 * service, no account or key needed.
 */
export async function lookupPostcode(postcode: string): Promise<Coords> {
  const pc = postcode.trim().replace(/\s+/g, '');
  if (pc.length < 5) throw new Error('Enter a full postcode, e.g. SW15 3RX.');
  let res: Response;
  try {
    res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
  } catch {
    throw new Error('No internet connection — could not look up that postcode.');
  }
  if (res.status === 404) throw new Error(`Postcode “${postcode.trim()}” was not found.`);
  const json: any = await res.json().catch(() => null);
  const r = json?.result;
  if (!r || typeof r.latitude !== 'number') throw new Error('Could not read the location for that postcode.');
  return { lat: r.latitude, lng: r.longitude };
}

/** Straight-line distance between two points, in miles. */
export function distanceMiles(a: Coords, b: Coords): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "0.4 miles" / "1.8 miles" / "12 miles" */
export function milesLabel(m: number): string {
  if (m < 0.1) return 'Right here';
  if (m < 10) return `${m.toFixed(1)} miles`;
  return `${Math.round(m)} miles`;
}

/** A maps link that opens Google Maps / the default maps app with directions. */
export function directionsUrl(c: Coords, label?: string): string {
  const q = `${c.lat},${c.lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}${
    label ? `&destination_place_id=&travelmode=driving` : ''
  }`;
}
