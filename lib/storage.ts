import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MondaySettings, ReportSettings, Property, InspectionRoutine,
  InspectionRecord, MileageEntry, CostEntry, Reminder, ViewingAttendee,
  AccountsSettings, MeterReading, LinkedApplicantRef,
} from './types';

const K = {
  monday: 'pc_monday_settings',
  report: 'pc_report_settings',
  properties: 'pc_properties',
  routines: 'pc_routines',
  inspections: 'pc_inspections',
  mileage: 'pc_mileage',
  costs: 'pc_costs',
  reminders: 'pc_reminders',
  accounts: 'pc_accounts_settings',
  meters: 'pc_meter_readings',
  attendance: 'pc_attendance', // { [viewingKey]: ViewingAttendee[] }
  expected: 'pc_expected',     // { [viewingKey]: LinkedApplicantRef[] } — cached from the schedule board
};

export const DEFAULT_MONDAY: MondaySettings = {
  apiToken: '',
  scheduleBoardId: '',
  scheduleTaskTypeCol: '',
  scheduleDateCol: '',
  scheduleStatusCol: '',
  scheduleApplicantsCol: '',
  timesAreUtc: true,
  scheduleFetchLimit: 85,
  applicantsBoardId: '',
  applicantsEmailCol: '',
  applicantsMobileCol: '',
  applicantsStatusCol: '',
  applicantsNotesCol: '',
  corsProxy: '',
};

export const DEFAULT_REPORT: ReportSettings = {
  recipientEmails: '',
  senderName: '',
  companyName: '',
  mileageEmails: '',
  costsEmails: '',
  metersEmails: '',
  ccEmails: '',
};

export const DEFAULT_ACCOUNTS: AccountsSettings = {
  ratePerMile: 0.5,
  charges: [
    { id: 'blackwall', name: 'Blackwall Tunnel', amount: 4 },
    { id: 'dart', name: 'Dart Crossing', amount: 2.5 },
    { id: 'congestion', name: 'Congestion Charge', amount: 15 },
  ],
  presets: [
    { id: 'lock', name: 'Lock change', amount: 0 },
    { id: 'smoke', name: 'Smoke alarm', amount: 0 },
    { id: 'keys', name: 'Keys cut', amount: 0 },
  ],
};

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function write(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export const store = {
  getMonday: async () => {
    const v = await read<MondaySettings>(K.monday, DEFAULT_MONDAY);
    // Merge defaults so settings saved by older versions still work
    return { ...DEFAULT_MONDAY, ...v };
  },
  setMonday: (v: MondaySettings) => write(K.monday, v),

  getReport: async () => {
    const v = await read<ReportSettings>(K.report, DEFAULT_REPORT);
    return { ...DEFAULT_REPORT, ...v };
  },
  setReport: (v: ReportSettings) => write(K.report, v),

  getAccounts: async () => {
    const v = await read<AccountsSettings>(K.accounts, DEFAULT_ACCOUNTS);
    return { ...DEFAULT_ACCOUNTS, ...v };
  },
  setAccounts: (v: AccountsSettings) => write(K.accounts, v),

  getMeters: () => read<MeterReading[]>(K.meters, []),
  setMeters: (v: MeterReading[]) => write(K.meters, v),

  getProperties: () => read<Property[]>(K.properties, []),
  setProperties: (v: Property[]) => write(K.properties, v),

  getRoutines: () => read<InspectionRoutine[]>(K.routines, []),
  setRoutines: (v: InspectionRoutine[]) => write(K.routines, v),

  getInspections: () => read<InspectionRecord[]>(K.inspections, []),
  setInspections: (v: InspectionRecord[]) => write(K.inspections, v),

  getMileage: () => read<MileageEntry[]>(K.mileage, []),
  setMileage: (v: MileageEntry[]) => write(K.mileage, v),

  getCosts: () => read<CostEntry[]>(K.costs, []),
  setCosts: (v: CostEntry[]) => write(K.costs, v),

  getReminders: () => read<Reminder[]>(K.reminders, []),
  setReminders: (v: Reminder[]) => write(K.reminders, v),

  getAttendance: () => read<Record<string, ViewingAttendee[]>>(K.attendance, {}),
  setAttendance: (v: Record<string, ViewingAttendee[]>) => write(K.attendance, v),

  // Who Monday.com says is expected at each viewing. Cached when the viewings
  // list loads so the viewing screen always has the names, even if it is
  // opened again later or reloaded.
  getExpected: () => read<Record<string, LinkedApplicantRef[]>>(K.expected, {}),
  setExpected: (v: Record<string, LinkedApplicantRef[]>) => write(K.expected, v),
};

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
