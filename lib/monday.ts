import { MondaySettings, ScheduleItem, Applicant, LinkedApplicantRef, NEW_APPLICANT_GROUP } from './types';

const API = 'https://api.monday.com/v2';

export class MondayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MondayError';
  }
}

async function gql<T = any>(settings: MondaySettings, query: string, variables?: Record<string, any>): Promise<T> {
  if (!settings.apiToken) throw new MondayError('Monday.com API token is not set. Add it in Settings.');
  const base = settings.corsProxy ? settings.corsProxy + encodeURIComponent(API) : API;
  let res: Response;
  try {
    res = await fetch(base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: settings.apiToken,
        'API-Version': '2024-10',
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (e: any) {
    throw new MondayError('Network error reaching Monday.com. If you are using the web preview, set a CORS proxy in Settings. (' + (e?.message || e) + ')');
  }
  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new MondayError('Bad response from Monday.com (HTTP ' + res.status + ').');
  }
  if (json.errors?.length) throw new MondayError(json.errors[0].message || 'Monday.com API error');
  if (json.error_message) throw new MondayError(json.error_message);
  return json.data as T;
}

function colText(item: any, colId: string): string {
  const c = (item.column_values || []).find((cv: any) => cv.id === colId);
  return c?.text?.trim() || '';
}

function colValue(item: any, colId: string): any {
  const c = (item.column_values || []).find((cv: any) => cv.id === colId);
  if (!c?.value) return null;
  try { return JSON.parse(c.value); } catch { return null; }
}

// Monday.com stores date-column times in UTC. Shift to the device's local time
// so an 11:00 viewing shows as 11:00 (not 10:00) during British Summer Time.
function utcToLocal(date: string, time: string): { date: string; time: string } {
  if (!date || !time) return { date, time };
  const d = new Date(`${date}T${time.length === 5 ? time + ':00' : time}Z`);
  if (isNaN(d.getTime())) return { date, time };
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

/**
 * Parse the “Applicants” column on the schedule board into a list of names
 * (with Monday item IDs when the column is a linked/connect-boards column).
 *
 * Works with every column type the board might use:
 *  - connect boards / board relation  → IDs + display names
 *  - dependency / mirror / dropdown / text → names only
 * Names-only is fine: the app can still list them and match by name.
 */
function linkedRefs(item: any, colId: string): LinkedApplicantRef[] {
  if (!colId) return [];
  const c = (item.column_values || []).find((cv: any) => cv.id === colId);
  if (!c) return [];
  return refsFromColumnValue(c);
}

/** Words that never belong to a person's name — used when sniffing columns */
const NOT_A_NAME = /^(complete|completed|done|no show|noshow|to rearrange|rearrange|viewing|inspection|check|working on it|stuck|pending|yes|no|n\/a|-|—)$/i;

/** Rough test for "this looks like a person's name, not a date/status/sentence" */
function isPersonName(raw: string): boolean {
  const t = (raw || '').trim();
  if (!t || t.length < 3 || t.length > 60) return false;
  if (NOT_A_NAME.test(t)) return false;
  if (/\d/.test(t)) return false;                 // dates, times, reference numbers
  if (!/[a-z]/i.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 3) return false;             // sentences and notes
  // Real names are capitalised; a sentence like "bring both key sets" is not
  const lower = words.filter((w) => /^[a-z]/.test(w)).length;
  if (lower > 1) return false;
  return true;
}

function refsFromColumnValue(c: any): LinkedApplicantRef[] {
  let ids: string[] = [];
  // Preferred: the typed BoardRelationValue field
  if (Array.isArray(c.linked_item_ids)) {
    ids = c.linked_item_ids.map((x: any) => String(x));
  } else {
    try {
      const v = JSON.parse(c.value || '{}');
      const pulses = v.linkedPulseIds || v.linked_pulse_ids || v.item_ids || [];
      ids = (Array.isArray(pulses) ? pulses : [])
        .map((p: any) => String(p?.linkedPulseId ?? p?.linked_pulse_id ?? p))
        .filter((s: string) => s && s !== 'undefined' && s !== 'null');
    } catch { /* no value */ }
  }
  const namesRaw: string = c.display_value || c.text || (() => {
    // people columns keep names inside the value JSON on some API versions
    try {
      const v = JSON.parse(c.value || '{}');
      if (Array.isArray(v.personsAndTeams)) return '';
    } catch { /* ignore */ }
    return '';
  })();
  // Monday joins linked names with commas; some boards use newlines or semicolons
  const names = namesRaw
    ? namesRaw.split(/[,;\n]/).map((n) => n.trim()).filter(Boolean)
    : [];
  if (ids.length === 0 && names.length === 0) return [];
  // If ids and names line up, pair them; otherwise fall back to whichever we have
  if (ids.length && names.length === ids.length) {
    return ids.map((id, i) => ({ id, name: names[i] }));
  }
  if (ids.length) return ids.map((id, i) => ({ id, name: names[i] || '' }));
  return names.map((name) => ({ id: '', name }));
}

/**
 * Some boards/API versions don't return the linked names, only the IDs.
 * Look the names up in one extra request so the app always shows real names.
 */
async function fillMissingNames(settings: MondaySettings, rows: ScheduleItem[]): Promise<void> {
  const missing = Array.from(new Set(
    rows.flatMap((r) => (r.expected || []).filter((e) => e.id && !e.name).map((e) => e.id)),
  ));
  if (missing.length === 0) return;
  const names: Record<string, string> = {};
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    try {
      const data = await gql<any>(settings, `query ($ids: [ID!]!) { items(ids: $ids) { id name } }`, { ids: chunk });
      for (const it of data.items || []) names[String(it.id)] = it.name;
    } catch { /* names stay blank rather than breaking the schedule */ }
  }
  for (const r of rows) {
    r.expected = (r.expected || []).map((e) => (e.id && !e.name ? { ...e, name: names[e.id] || 'Linked applicant' } : e));
  }
}

// ---- Schedule board ----

// Column selection that also unwraps every column type that can hold linked
// applicant names: connect boards, dependency, mirror, people and dropdown.
const SCHEDULE_COLS = `column_values {
  id text value
  ... on BoardRelationValue { display_value linked_item_ids }
  ... on DependencyValue { display_value linked_item_ids }
  ... on MirrorValue { display_value }
  ... on PeopleValue { text }
  ... on DropdownValue { text }
}`;

const SCHEDULE_COLS_BASIC = `column_values { id text value }`;

/** Column types that could hold the list of applicants for a viewing */
const APPLICANT_COL_TYPES = ['board_relation', 'dependency', 'mirror', 'people', 'dropdown', 'text', 'long_text', 'long-text'];
const APPLICANT_TITLE = /applicant|attend|viewer|candidate|tenant|people|guest|name/i;

/** Set by the last fetchSchedule so Settings can explain where names came from */
let expectedSource = '';
export function getExpectedSource(): string { return expectedSource; }

function looksLikeNames(refs: LinkedApplicantRef[]): boolean {
  const named = refs.filter((r) => r.name && isPersonName(r.name));
  return refs.some((r) => r.id) || named.length > 0;
}

/**
 * Fill in `expected` for every schedule row, trying hardest to find the names:
 *  1. the configured Applicants column
 *  2. any other column on the schedule board that holds linked names
 *  3. the reverse direction — a column on the applicants board that points back
 *     at the schedule board (one-way "connect boards" columns only exist on one side)
 */
async function attachExpected(settings: MondaySettings, rows: ScheduleItem[], items: any[]): Promise<void> {
  const total = () => rows.reduce((n, r) => n + (r.expected?.length || 0), 0);

  if (settings.scheduleApplicantsCol && total() > 0) {
    expectedSource = `Column "${settings.scheduleApplicantsCol}" on the schedule board`;
    await fillMissingNames(settings, rows);
    return;
  }

  // ---- 2. sniff the other columns on the schedule board ----
  let columns: BoardColumn[] = [];
  try { columns = await fetchBoardColumns(settings, Number(settings.scheduleBoardId)); } catch { /* ignore */ }
  const used = new Set([settings.scheduleTaskTypeCol, settings.scheduleDateCol, settings.scheduleStatusCol].filter(Boolean));
  // Free-text / people / dropdown columns are only considered when their title
  // sounds like applicants, so a Notes or Assignee column is never mistaken for one.
  const TITLE_REQUIRED = ['text', 'long_text', 'long-text', 'people', 'dropdown'];
  const candidates = columns
    .filter((c) => !used.has(c.id) && APPLICANT_COL_TYPES.includes(c.type)
      && (!TITLE_REQUIRED.includes(c.type) || APPLICANT_TITLE.test(c.title)))
    .sort((a, b) => {
      const score = (c: BoardColumn) =>
        (APPLICANT_TITLE.test(c.title) ? 2 : 0) + (c.type === 'board_relation' || c.type === 'dependency' ? 1 : 0);
      return score(b) - score(a);
    });

  for (const col of candidates) {
    const trial = items.map((it) => linkedRefs(it, col.id));
    const hits = trial.reduce((n, t) => n + t.length, 0);
    if (hits > 0 && trial.some(looksLikeNames)) {
      rows.forEach((r, i) => { r.expected = trial[i]; });
      expectedSource = `Auto-detected column "${col.title}" (${col.id}) on the schedule board`;
      await fillMissingNames(settings, rows);
      return;
    }
  }

  // ---- 3. reverse lookup from the applicants board ----
  const appBoard = Number(settings.applicantsBoardId);
  const schedBoard = String(settings.scheduleBoardId);
  if (!appBoard) { expectedSource = 'No applicants found on the schedule board'; return; }
  try {
    const appCols = await fetchBoardColumns(settings, appBoard);
    const linkCols = appCols.filter((c) => {
      if (c.type !== 'board_relation' && c.type !== 'dependency') return false;
      if (!c.settings_str) return true;
      return c.settings_str.includes(schedBoard);
    });
    if (linkCols.length === 0) { expectedSource = 'No applicants column found on either board'; return; }

    const byScheduleId: Record<string, LinkedApplicantRef[]> = {};
    let cursor: string | null = null;
    let pages = 0;
    do {
      const data: any = await gql(settings,
        cursor
          ? `query ($cursor: String!) { next_items_page(limit: 250, cursor: $cursor) { cursor items { id name ${SCHEDULE_COLS} } } }`
          : `query ($board: [ID!]!) { boards(ids: $board) { items_page(limit: 250) { cursor items { id name ${SCHEDULE_COLS} } } } }`,
        cursor ? { cursor } : { board: [appBoard] });
      const page: any = cursor ? data.next_items_page : data.boards?.[0]?.items_page;
      for (const it of page?.items || []) {
        for (const lc of linkCols) {
          for (const ref of linkedRefs(it, lc.id)) {
            if (!ref.id) continue;
            (byScheduleId[ref.id] = byScheduleId[ref.id] || []).push({ id: String(it.id), name: it.name });
          }
        }
      }
      cursor = page?.cursor || null;
      pages += 1;
    } while (cursor && pages < 12);

    let matched = 0;
    for (const r of rows) {
      const found = byScheduleId[String(r.id)];
      if (found?.length) { r.expected = found; matched += found.length; }
    }
    expectedSource = matched > 0
      ? `Read from the applicants board column "${linkCols[0].title}" pointing back at the schedule`
      : 'No applicants linked to these viewings on either board';
  } catch (e: any) {
    expectedSource = 'Could not read the applicants board (' + (e?.message || e) + ')';
  }
}

/**
 * Settings helper: what every column on the schedule board actually contains,
 * so the right Applicants column can be picked without guessing an ID.
 */
export async function inspectScheduleColumns(settings: MondaySettings): Promise<{
  columns: { id: string; title: string; type: string; sample: string; names: number }[];
  source: string;
}> {
  const boardId = Number(settings.scheduleBoardId);
  if (!boardId) throw new MondayError('Schedule board ID is not set. Add it in Settings.');
  const cols = await fetchBoardColumns(settings, boardId);
  const data = await gql<any>(settings,
    `query ($board: [ID!]!) { boards(ids: $board) { items_page(limit: 25) { items { id name ${SCHEDULE_COLS} } } } }`,
    { board: [boardId] });
  const items: any[] = data.boards?.[0]?.items_page?.items || [];
  const out = cols.map((c) => {
    let sample = '';
    let names = 0;
    for (const it of items) {
      const refs = linkedRefs(it, c.id);
      if (refs.length) {
        names += refs.filter((r) => r.id || isPersonName(r.name || '')).length;
        if (!sample) sample = refs.map((r) => r.name || `#${r.id}`).join(', ');
      }
      if (!sample) {
        const cv = (it.column_values || []).find((x: any) => x.id === c.id);
        const t = cv?.display_value || cv?.text || '';
        if (t) sample = t;
      }
    }
    return { id: c.id, title: c.title, type: c.type, sample: sample.slice(0, 120), names };
  });
  return { columns: out, source: expectedSource };
}

export async function fetchSchedule(settings: MondaySettings): Promise<ScheduleItem[]> {
  const boardId = Number(settings.scheduleBoardId);
  if (!boardId) throw new MondayError('Schedule board ID is not set. Add it in Settings.');
  // Only pull the top slice of the board — the most recent rows sit at the top,
  // so one small page keeps the app fast instead of paging through thousands.
  const limit = Math.max(1, Math.min(500, Number(settings.scheduleFetchLimit) || 85));
  let items: any[] = [];
  try {
    const data = await gql<any>(settings,
      `query ($board: [ID!]!, $limit: Int!) {
        boards(ids: $board) { items_page(limit: $limit) { items { id name ${SCHEDULE_COLS} } } }
      }`,
      { board: [boardId], limit });
    items = data.boards?.[0]?.items_page?.items || [];
  } catch (e) {
    // Older API versions may not expose BoardRelationValue — retry without the fragment
    const data = await gql<any>(settings,
      `query ($board: [ID!]!, $limit: Int!) {
        boards(ids: $board) { items_page(limit: $limit) { items { id name ${SCHEDULE_COLS_BASIC} } } }
      }`,
      { board: [boardId], limit });
    items = data.boards?.[0]?.items_page?.items || [];
  }
  const rows: ScheduleItem[] = items.map((it) => {
    const dateVal = colValue(it, settings.scheduleDateCol);
    let date = '';
    let time = '';
    if (dateVal?.date) {
      date = dateVal.date; // YYYY-MM-DD (UTC)
      time = dateVal.time ? dateVal.time.slice(0, 5) : '';
      if (time && settings.timesAreUtc !== false) {
        const local = utcToLocal(date, time);
        date = local.date;
        time = local.time;
      }
    } else {
      const text = colText(it, settings.scheduleDateCol);
      // Try to parse text like "2026-08-11 14:30" or "11/08/2026 14:30"
      const iso = text.match(/(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}:\d{2}))?/);
      const uk = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}))?/);
      if (iso) { date = `${iso[1]}-${iso[2]}-${iso[3]}`; time = iso[4] || ''; }
      else if (uk) { date = `${uk[3]}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}`; time = uk[4] || ''; }
    }
    return {
      id: it.id,
      address: it.name,
      taskType: colText(it, settings.scheduleTaskTypeCol),
      date,
      time,
      status: colText(it, settings.scheduleStatusCol),
      expected: linkedRefs(it, settings.scheduleApplicantsCol),
    };
  });
  await attachExpected(settings, rows, items);
  return rows;
}

export async function setScheduleStatus(settings: MondaySettings, itemId: string, status: string): Promise<void> {
  await setStatusColumn(settings, Number(settings.scheduleBoardId), itemId, settings.scheduleStatusCol, status);
}

// ---- Applicants board ----

function mapApplicant(it: any, settings: MondaySettings, parentId?: string): Applicant {
  return {
    id: it.id,
    name: it.name,
    email: colText(it, settings.applicantsEmailCol),
    mobile: colText(it, settings.applicantsMobileCol),
    group: it.group?.title || '',
    viewingStatus: colText(it, settings.applicantsStatusCol),
    viewingNotes: colText(it, settings.applicantsNotesCol),
    subitems: (it.subitems || []).map((s: any) => mapApplicant(s, settings, it.id)),
    parentId,
  };
}

const APPLICANT_FIELDS = `id name group { id title } column_values { id text value } subitems { id name column_values { id text value } }`;

// Server-side search across the WHOLE applicants board (boards can hold thousands
// of rows, so we never download them all). One request per searchable column,
// merged together. Any column that doesn't support text matching is ignored, and
// if Monday.com rejects every rule we fall back to scanning pages of the board.
export async function searchApplicants(settings: MondaySettings, term: string): Promise<Applicant[]> {
  const boardId = Number(settings.applicantsBoardId);
  if (!boardId) throw new MondayError('Applicants board ID is not set. Add it in Settings.');
  const q = term.trim();
  if (q.length < 2) return [];

  const cols = ['name', settings.applicantsEmailCol, settings.applicantsMobileCol]
    .filter((c, i, arr) => !!c && arr.indexOf(c) === i);

  // Phone numbers are often stored with spaces — search digits only as well
  const digits = q.replace(/[^\d]/g, '');
  const termsFor = (col: string) =>
    col === settings.applicantsMobileCol && digits.length >= 4 && digits !== q ? [q, digits] : [q];

  // compare_value is a JSON scalar on Monday's schema, so the rule is inlined as
  // a literal rather than passed as a typed GraphQL variable (which errors).
  const jsonStr = (s: string) => JSON.stringify(s);

  const queryOne = async (columnId: string, value: string) => {
    const data = await gql<any>(settings,
      `query {
        boards(ids: [${boardId}]) {
          items_page(limit: 50, query_params: {
            rules: [{ column_id: ${jsonStr(columnId)}, compare_value: [${jsonStr(value)}], operator: contains_text }]
          }) { items { ${APPLICANT_FIELDS} } }
        }
      }`);
    return data.boards?.[0]?.items_page?.items || [];
  };

  const errors: string[] = [];
  const jobs: Promise<any[]>[] = [];
  for (const col of cols) for (const t of termsFor(col)) {
    jobs.push(queryOne(col, t).catch((e: any) => {
      errors.push(`${col}: ${e?.message || e}`);
      return [] as any[];
    }));
  }
  const settled = await Promise.all(jobs);

  const seen = new Set<string>();
  const out: Applicant[] = [];
  for (const arr of settled) {
    for (const it of arr) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(mapApplicant(it, settings));
    }
  }

  // Every rule was rejected by Monday.com — fall back to paging the board locally
  if (out.length === 0 && errors.length === jobs.length && jobs.length > 0) {
    return scanApplicants(settings, q);
  }

  // Exact/prefix name matches first
  const lower = q.toLowerCase();
  out.sort((a, b) => {
    const rank = (n: string) => (n.toLowerCase().startsWith(lower) ? 0 : 1);
    return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
  });
  return out.slice(0, 25);
}

// Fallback search: page through the board and filter on the device. Slower, but
// it always works, even if the board's columns don't support server-side rules.
async function scanApplicants(settings: MondaySettings, q: string): Promise<Applicant[]> {
  const boardId = Number(settings.applicantsBoardId);
  const lower = q.toLowerCase();
  const digits = q.replace(/[^\d]/g, '');
  const matches: Applicant[] = [];
  let cursor: string | null = null;
  // Up to 12 pages of 250 = 3,000 rows, then stop so the app never hangs
  for (let page = 0; page < 12; page++) {
    const data: any = cursor
      ? await gql<any>(settings,
          `query ($cursor: String!) { next_items_page(limit: 250, cursor: $cursor) { cursor items { ${APPLICANT_FIELDS} } } }`,
          { cursor })
      : await gql<any>(settings,
          `query ($board: [ID!]!) { boards(ids: $board) { items_page(limit: 250) { cursor items { ${APPLICANT_FIELDS} } } } }`,
          { board: [boardId] });
    const pageData: any = cursor ? data.next_items_page : data.boards?.[0]?.items_page;
    const items: any[] = pageData?.items || [];
    for (const it of items) {
      const a = mapApplicant(it, settings);
      const hay = `${a.name} ${a.email} ${a.mobile}`.toLowerCase();
      const hayDigits = a.mobile.replace(/[^\d]/g, '');
      if (hay.includes(lower) || (digits.length >= 4 && hayDigits.includes(digits))) {
        matches.push(a);
        if (matches.length >= 25) return matches;
      }
    }
    cursor = pageData?.cursor || null;
    if (!cursor) break;
  }
  return matches;
}

// Fetch specific applicants by ID (used for the linked “Applicants” column)
export async function fetchApplicantsByIds(settings: MondaySettings, ids: string[]): Promise<Applicant[]> {
  const clean = ids.filter(Boolean);
  if (clean.length === 0) return [];
  const data = await gql<any>(settings,
    `query ($ids: [ID!]!) { items(ids: $ids) { ${APPLICANT_FIELDS} } }`,
    { ids: clean });
  return (data.items || []).map((it: any) => mapApplicant(it, settings));
}

export async function fetchApplicantGroups(settings: MondaySettings): Promise<{ id: string; title: string }[]> {
  const boardId = Number(settings.applicantsBoardId);
  if (!boardId) return [];
  const data = await gql<any>(settings, `query ($board: [ID!]!) { boards(ids: $board) { groups { id title } } }`, { board: [boardId] });
  return data.boards?.[0]?.groups || [];
}

// ---- Column metadata (cached per board) ----

interface BoardColumn { id: string; title: string; type: string; settings_str?: string }

const colCache: Record<string, BoardColumn[]> = {};

export async function fetchBoardColumns(settings: MondaySettings, boardId: number): Promise<BoardColumn[]> {
  const key = String(boardId);
  if (colCache[key]) return colCache[key];
  const data = await gql<any>(settings,
    `query ($board: [ID!]!) { boards(ids: $board) { columns { id title type settings_str } } }`,
    { board: [boardId] });
  const cols: BoardColumn[] = data.boards?.[0]?.columns || [];
  colCache[key] = cols;
  return cols;
}

/** Labels available on a status/dropdown column, e.g. ["Complete", "No Show"] */
export async function statusLabels(settings: MondaySettings, boardId: number, columnId: string): Promise<string[]> {
  try {
    const cols = await fetchBoardColumns(settings, boardId);
    const col = cols.find((c) => c.id === columnId);
    if (!col?.settings_str) return [];
    const parsed = JSON.parse(col.settings_str);
    const labels = parsed.labels;
    if (Array.isArray(labels)) return labels.map((l: any) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);
    if (labels && typeof labels === 'object') return Object.values(labels).filter((v): v is string => typeof v === 'string' && !!v);
    return [];
  } catch {
    return [];
  }
}

// ---- Writes ----

/** JSON value shaped for the column's type (email/phone columns reject plain text) */
function typedValue(type: string, value: string): any {
  switch (type) {
    case 'email':
      return { email: value, text: value };
    case 'phone': {
      const digits = value.replace(/[^\d+]/g, '');
      return { phone: digits, countryShortName: 'GB' };
    }
    case 'status':
    case 'color':
      return { label: value };
    case 'dropdown':
      return { labels: [value] };
    case 'long_text':
      return { text: value };
    case 'numbers':
      return value;
    case 'link':
      return { url: value, text: value };
    default:
      return value;
  }
}

/**
 * Write one column, shaping the value for that column's type. Falls back to the
 * simple-value mutation if the board's columns can't be read.
 */
export async function setColumn(
  settings: MondaySettings, boardId: number, itemId: string, columnId: string, value: string,
): Promise<void> {
  if (!columnId) throw new MondayError('A column ID is missing in Settings.');
  let type = 'text';
  try {
    const cols = await fetchBoardColumns(settings, boardId);
    const col = cols.find((c) => c.id === columnId);
    if (!col) {
      throw new MondayError(
        `Column "${columnId}" does not exist on board ${boardId}. Check the column ID in Settings.`);
    }
    type = col.type;
  } catch (e) {
    if (e instanceof MondayError && e.message.includes('does not exist')) throw e;
    // Couldn't read the board columns — try the simple mutation and let it speak
    await updateSimpleColumn(settings, boardId, itemId, columnId, value);
    return;
  }
  const payload = JSON.stringify({ [columnId]: typedValue(type, value) });
  await gql(settings,
    `mutation ($board: ID!, $item: ID!, $vals: JSON!) {
      change_multiple_column_values(board_id: $board, item_id: $item, column_values: $vals) { id }
    }`,
    { board: boardId, item: itemId, vals: payload });
}

/**
 * Write a status column, matching the label against the board's real labels so
 * differences in wording or capitalisation ("No show" vs "No Show") still work.
 */
export async function setStatusColumn(
  settings: MondaySettings, boardId: number, itemId: string, columnId: string, wanted: string,
): Promise<void> {
  if (!columnId) throw new MondayError('A column ID is missing in Settings.');
  const labels = await statusLabels(settings, boardId, columnId);
  let label = wanted;
  if (labels.length) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    const exact = labels.find((l) => l === wanted)
      || labels.find((l) => norm(l) === norm(wanted))
      || labels.find((l) => norm(l).includes(norm(wanted)) || norm(wanted).includes(norm(l)));
    if (!exact) {
      throw new MondayError(
        `“${wanted}” is not a label on that status column. Available labels: ${labels.join(', ')}.`);
    }
    label = exact;
  }
  await setColumn(settings, boardId, itemId, columnId, label);
}

export async function updateSimpleColumn(
  settings: MondaySettings, boardId: number, itemId: string, columnId: string, value: string,
): Promise<void> {
  if (!columnId) throw new MondayError('A column ID is missing in Settings.');
  await gql(settings,
    `mutation ($board: ID!, $item: ID!, $col: String!, $val: String!) {
      change_simple_column_value(board_id: $board, item_id: $item, column_id: $col, value: $val) { id }
    }`,
    { board: boardId, item: itemId, col: columnId, val: value });
}

export async function setApplicantStatus(settings: MondaySettings, applicantId: string, status: string): Promise<void> {
  await setStatusColumn(settings, Number(settings.applicantsBoardId), applicantId, settings.applicantsStatusCol, status);
}

export async function appendApplicantNote(settings: MondaySettings, applicantId: string, existing: string, note: string): Promise<string> {
  const stamp = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const combined = existing ? `${existing}\n[${stamp}] ${note}` : `[${stamp}] ${note}`;
  await setColumn(settings, Number(settings.applicantsBoardId), applicantId, settings.applicantsNotesCol, combined);
  return combined;
}

// Find the “To Check” group on the applicants board (new applicants always go there)
export async function findToCheckGroupId(settings: MondaySettings): Promise<string | null> {
  try {
    const groups = await fetchApplicantGroups(settings);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    const target = norm(NEW_APPLICANT_GROUP);
    const exact = groups.find((g) => norm(g.title) === target);
    if (exact) return exact.id;
    const loose = groups.find((g) => norm(g.title).includes('tocheck'));
    return loose ? loose.id : null;
  } catch {
    return null;
  }
}

export async function createApplicant(
  settings: MondaySettings,
  input: { name: string; email: string; mobile: string },
): Promise<string> {
  const boardId = Number(settings.applicantsBoardId);
  if (!boardId) throw new MondayError('Applicants board ID is not set. Add it in Settings.');
  if (!input.name.trim()) throw new MondayError('A name is required.');

  // New applicants always land in the “To Check” group
  const groupId = await findToCheckGroupId(settings);

  // Build the column values in the shape each column type expects. Email and
  // phone columns reject plain strings, which is what caused “add applicant” to fail.
  const vals: Record<string, any> = {};
  try {
    const cols = await fetchBoardColumns(settings, boardId);
    const typeOf = (id: string) => cols.find((c) => c.id === id)?.type || '';
    if (input.email && settings.applicantsEmailCol && typeOf(settings.applicantsEmailCol)) {
      vals[settings.applicantsEmailCol] = typedValue(typeOf(settings.applicantsEmailCol), input.email.trim());
    }
    if (input.mobile && settings.applicantsMobileCol && typeOf(settings.applicantsMobileCol)) {
      vals[settings.applicantsMobileCol] = typedValue(typeOf(settings.applicantsMobileCol), input.mobile.trim());
    }
  } catch { /* create the item anyway, then fill the columns one by one below */ }

  const hasVals = Object.keys(vals).length > 0;
  const data = await gql<any>(settings,
    groupId
      ? `mutation ($board: ID!, $name: String!, $group: String!${hasVals ? ', $vals: JSON!' : ''}) {
          create_item(board_id: $board, item_name: $name, group_id: $group${hasVals ? ', column_values: $vals' : ''}) { id }
        }`
      : `mutation ($board: ID!, $name: String!${hasVals ? ', $vals: JSON!' : ''}) {
          create_item(board_id: $board, item_name: $name${hasVals ? ', column_values: $vals' : ''}) { id }
        }`,
    {
      board: boardId,
      name: input.name.trim(),
      ...(groupId ? { group: groupId } : {}),
      ...(hasVals ? { vals: JSON.stringify(vals) } : {}),
    });

  const id: string = data?.create_item?.id;
  if (!id) throw new MondayError('Monday.com did not return the new item. Check the applicants board ID.');

  // If the column shapes couldn't be read up front, fill them in now (best effort)
  if (!hasVals) {
    if (input.email && settings.applicantsEmailCol) {
      try { await setColumn(settings, boardId, id, settings.applicantsEmailCol, input.email.trim()); } catch { /* keep the item */ }
    }
    if (input.mobile && settings.applicantsMobileCol) {
      try { await setColumn(settings, boardId, id, settings.applicantsMobileCol, input.mobile.trim()); } catch { /* keep the item */ }
    }
  }
  return id;
}

// ---- Connection test ----

export async function testConnection(settings: MondaySettings): Promise<string> {
  const data = await gql<any>(settings, `query { me { name email } }`);
  const me = data.me;
  return me ? `Connected as ${me.name} (${me.email})` : 'Connected.';
}
