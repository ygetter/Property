import { ScheduleItem, LinkedApplicantRef } from './types';

export interface GroupedViewing {
  key: string;
  display: string;       // "Unit (2, 3), 128 Roehampton Vale, Roehampton, London, SW15 3RX"
  items: ScheduleItem[]; // all schedule items merged into this viewing
  time: string;
  date: string;
  /** Applicants linked on the schedule board across all merged units */
  expected: LinkedApplicantRef[];
  /** Shared status if every merged item agrees, else '' */
  status: string;
}

// Matches "Unit 2, ...", "Flat 1, ...", "Room 4, ...", "Apartment 3B, ..." at the START of the address
const UNIT_RE = /^\s*(unit|flat|room|apartment|apt|maisonette)\s+([0-9]+[a-zA-Z]?)\s*,\s*(.+)$/i;

export function groupViewings(items: ScheduleItem[]): GroupedViewing[] {
  const buckets = new Map<string, ScheduleItem[]>();
  for (const it of items) {
    const m = it.address.match(UNIT_RE);
    // Bucket key: unit-prefix + rest of address (so "Unit 2, X" and "Unit 3, X" share a bucket)
    const key = m ? `${m[1].toLowerCase()}::${m[3].toLowerCase().trim()}` : `solo::${it.id}`;
    const arr = buckets.get(key) || [];
    arr.push(it);
    buckets.set(key, arr);
  }

  const groups: GroupedViewing[] = [];
  for (const arr of buckets.values()) {
    const sorted = [...arr].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const first = sorted[0];
    let display = first.address;
    if (arr.length > 1) {
      const parsed = arr.map((it) => it.address.match(UNIT_RE)).filter(Boolean) as RegExpMatchArray[];
      if (parsed.length === arr.length) {
        const prefix = parsed[0][1];
        const rest = parsed[0][3].trim();
        const nums = parsed
          .map((p) => p[2])
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .join(', ');
        display = `${cap(prefix)} (${nums}), ${rest}`;
      }
    }
    // Merge the linked applicants of every unit in this viewing, de-duplicated
    const expected: LinkedApplicantRef[] = [];
    const seen = new Set<string>();
    for (const it of sorted) {
      for (const ref of it.expected || []) {
        const k = ref.id || ref.name.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        expected.push(ref);
      }
    }
    const statuses = Array.from(new Set(sorted.map((s) => s.status).filter(Boolean)));

    groups.push({
      key: sorted.map((s) => s.id).join('|'),
      display,
      items: sorted,
      time: first.time,
      date: first.date,
      expected,
      status: statuses.length === 1 ? statuses[0] : '',
    });
  }
  return groups.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
}

/** Loose name key so “Sarah  Cohen” and “sarah cohen” count as the same person */
export function normName(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toDateStr(d);
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function friendlyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
