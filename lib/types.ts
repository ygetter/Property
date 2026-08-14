// ---- Core data types for Property Companion ----

export interface MondaySettings {
  apiToken: string;
  // Schedule board
  scheduleBoardId: string;
  scheduleTaskTypeCol: string;   // "what the task is" e.g. Viewing / Inspection
  scheduleDateCol: string;       // date & time column
  scheduleStatusCol: string;     // Complete / No show / Reschedule
  scheduleApplicantsCol: string; // linked (board relation) column -> applicants expected to attend
  // Times on Monday.com date columns are stored in UTC. Keep true to shift to your phone's local time.
  timesAreUtc: boolean;
  // How many schedule rows to pull (most recent are at the top of the board)
  scheduleFetchLimit: number;
  // Applicants board
  applicantsBoardId: string;
  applicantsEmailCol: string;
  applicantsMobileCol: string;
  applicantsStatusCol: string;   // viewing status
  applicantsNotesCol: string;    // viewing notes
  // Optional CORS proxy prefix for web use, e.g. https://corsproxy.io/?url=
  corsProxy: string;
}

export interface ReportSettings {
  recipientEmails: string; // viewings report recipients, comma separated
  senderName: string;
  companyName: string;
  // Separate recipients per report type (fall back to recipientEmails when blank)
  mileageEmails: string;
  costsEmails: string;
  metersEmails: string;
  ccEmails: string;
}

export interface LinkedApplicantRef {
  id: string;
  name: string;
}

export interface ScheduleItem {
  id: string;
  address: string;      // item name (first column)
  taskType: string;
  date: string;         // ISO date part
  time: string;         // HH:mm
  status: string;
  rawDateTime?: string;
  // From the linked "Applicants" column — who said they would attend
  expected: LinkedApplicantRef[];
}

export interface Applicant {
  id: string;
  name: string;
  email: string;
  mobile: string;
  group: string;        // benefits group title e.g. Uncapped / Capped / PIP
  viewingStatus: string;
  viewingNotes: string;
  subitems: Applicant[];
  parentId?: string;
}

export type ViewingOutcome =
  | 'Good'
  | 'Very Good'
  | 'Not Good'
  | 'Needs LL Ref'
  | 'Needs Check';

export const VIEWING_OUTCOMES: ViewingOutcome[] = [
  'Good',
  'Very Good',
  'Not Good',
  'Needs LL Ref',
  'Needs Check',
];

// Task status values written back to the schedule board.
// These must match the labels on your Monday.com status column exactly
// (matching is also done case-insensitively as a safety net).
export type TaskStatus = 'Complete' | 'No Show' | 'To Rearrange';

export const TASK_STATUSES: TaskStatus[] = ['Complete', 'No Show', 'To Rearrange'];

// New applicants always land in this group on the applicants board
export const NEW_APPLICANT_GROUP = 'To Check';

// An applicant attached to a specific viewing (attendance record)
export interface ViewingAttendee {
  applicantId: string;
  name: string;
  group: string;
  email: string;
  mobile: string;
  status: string;      // ViewingOutcome or ''
  note: string;
  isSubitem: boolean;
  addedAt: number;
}

// ---- Property structures ----

export interface PropertyUnit {
  id: string;
  label: string;        // "Unit 2", "Flat 1", "Room 4"
  kind: 'hmo-room' | 'flat' | 'bedroom' | 'studio' | 'house' | 'other';
  ensuite: boolean;
  kitchens: number;
  bathrooms: number;
  children: PropertyUnit[]; // e.g. a flat containing bedrooms / HMO rooms
}

export interface Property {
  id: string;
  address: string;
  postcode: string;
  type: 'HMO' | 'House' | 'Flats' | 'Studio' | 'Flat' | 'Other';
  kitchens: number;
  bathrooms: number;
  notes: string;
  units: PropertyUnit[];
  createdAt: number;
  /** Map location, used by the “Nearby properties” list */
  lat?: number;
  lng?: number;
  /** How the location was set — "Postcode" or "Pinned on site" */
  locationSource?: string;
}

// ---- Inspections ----

export type AnswerType = 'text' | 'yesno' | 'multi' | 'number' | 'rating';

export type QuestionScope =
  | 'property'   // asked once per property
  | 'unit'       // asked once per unit / room
  | 'bedroom'    // asked per bedroom (children of units)
  | 'kitchen'    // asked per kitchen (count from facilities)
  | 'bathroom'   // asked per bathroom
  | 'communal'   // asked once if property has shared areas (HMO / Flats)
  | 'exterior';  // asked once per property

export interface InspectionQuestion {
  id: string;
  text: string;
  answerType: AnswerType;
  options: string[];   // for 'multi'
  scope: QuestionScope;
}

export interface InspectionRoutine {
  id: string;
  name: string;
  questions: InspectionQuestion[];
  updatedAt: number;
}

export interface InspectionAnswer {
  questionId: string;
  questionText: string;
  answerType: AnswerType;
  scope: QuestionScope;
  targetLabel: string; // e.g. "Room 2", "Kitchen 1", "Whole property"
  value: string;
  options: string[]; // choices for 'multi' answer type
}

export interface InspectionRecord {
  id: string;
  propertyId: string;
  propertyAddress: string;
  routineName: string;
  startedAt: number;
  completedAt: number | null;
  answers: InspectionAnswer[];
  uploaded: boolean;   // marked once uploaded to custom software
}

// ---- Accounts (mileage / costs / meter readings) ----

/** A toll or charge that can be applied to a day, e.g. Blackwall Tunnel */
export interface TravelCharge {
  id: string;
  name: string;
  amount: number;      // £ per occurrence
}

/** A recurring thing installed/bought, shown as a one-tap button on the costs screen */
export interface PresetCostItem {
  id: string;
  name: string;        // e.g. "Lock change"
  amount: number;      // default £ (editable when adding)
}

export interface AccountsSettings {
  ratePerMile: number;         // £ per mile, default 0.50
  charges: TravelCharge[];     // Blackwall Tunnel / Dart Crossing / Congestion Charge
  presets: PresetCostItem[];   // set things you install
}

/** One property visit on a day. count = how many times visited that day. */
export interface DayVisit {
  propertyId: string;
  address: string;
  count: number;
}

/** A charge actually paid on a day (snapshotted so later price changes don't rewrite history) */
export interface DayCharge {
  chargeId: string;
  name: string;
  amount: number;
  times: number;       // how many times paid that day
}

export interface MileageEntry {
  id: string;
  date: string;        // YYYY-MM-DD
  startMiles: string;
  endMiles: string;
  visits: DayVisit[];
  charges: DayCharge[];
  note: string;
}

export interface CostEntry {
  id: string;
  date: string;
  label: string;       // preset name or free text
  isPreset: boolean;
  amount: string;
  propertyId: string;
  address: string;
  note: string;
  receiptUri: string;  // local photo/file URI, '' if none
  emailed: boolean;
}

export interface MeterReading {
  id: string;
  date: string;
  propertyId: string;
  address: string;
  note: string;
  photos: string[];    // local photo URIs
  emailed: boolean;
}

/** Result of apportioning a month's travel costs across properties */
export interface PropertyCharge {
  propertyId: string;
  address: string;
  visits: number;
  mileage: number;     // £ share of mileage
  charges: Record<string, number>; // charge name -> £ share
  chargesTotal: number;
  total: number;
}

export interface DayBreakdown {
  date: string;
  miles: number;
  mileageCost: number;
  visits: DayVisit[];
  totalVisits: number;
  distinctProperties: number;
  charges: DayCharge[];
  chargesCost: number;
  perVisit: number;      // £ mileage per visit
  perProperty: number;   // £ charges per distinct property
  total: number;
}

// ---- Reminders ----

export interface Reminder {
  id: string;
  title: string;
  type: 'time' | 'location';
  time?: string;       // ISO
  address?: string;    // location-based target
  note: string;
  done: boolean;
  createdAt: number;
}
