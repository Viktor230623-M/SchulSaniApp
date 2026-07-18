export type UserRole =
  | "cto"
  | "sanitaeter"
  | "student_paramedic"
  | "sanitaeter_leitung"
  | "sanitaeter_leitung_admin"
  | "admin"
  | "teacher";

export interface User {
  id: string;
  iservUsername?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: UserRole;
  schoolId: string;
  isApproved?: boolean;
  avatarUri?: string;
  createdAt: string;
  updatedAt: string;
}

export type MissionStatus = "pending" | "accepted" | "rejected" | "completed" | "archived";
export type MissionPriority = "high" | "medium" | "low";

export interface Mission {
  id: string;
  title: string;
  description: string;
  location: string;
  priority: MissionPriority;
  status: MissionStatus;
  requestedAt: string;
  scheduledFor: string;
  assignedParamedicId?: string;
  patientInfo?: string;
  notes?: string;
  translationsJson?: string | null;
}

export type DutyStatusType = "on_duty" | "off_duty";

export interface DutyStatus {
  userId: string;
  status: DutyStatusType;
  updatedAt: string;
}

export type NewsStatus = "pending" | "approved" | "rejected";

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: "announcement" | "training" | "update" | "alert";
  status: NewsStatus;
  publishedAt: string;
  author: string;
  authorId: string;
  imageUrl?: string;
  isRead: boolean;
  rejectionReason?: string;
  translationsJson?: string | null;
}

export type NotificationType =
  | "mission_assigned"
  | "mission_cancelled"
  | "mission_completed"
  | "mission_created"
  | "status_changed"
  | "news"
  | "loa_update"
  | "reminder"
  | "high_priority_alert";

export interface NotificationItem {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  priority: "normal" | "high";
  createdAt: string;
  relatedId?: string;
}

export type LOAStatus = "pending" | "approved" | "rejected" | "appealed";

export interface LOARequest {
  id: string;
  userId: string;
  userName: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: LOAStatus;
  createdAt: string;
  adminNote?: string;
  appealNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  translationsJson?: string | null;
}

export type ActivityType =
  | "login"
  | "logout"
  | "mission_accepted"
  | "mission_rejected"
  | "mission_completed"
  | "duty_status_changed"
  | "loa_requested"
  | "loa_approved"
  | "loa_rejected"
  | "news_created"
  | "news_approved"
  | "news_rejected";

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  activityType: ActivityType;
  description: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface MissionActivityLog {
  id: string;
  userId: string;
  userName: string;
  missionId: string;
  missionTitle: string;
  action: "accepted" | "dismissed" | "unanswered" | "completed";
  weekKey: string;
  dayKey: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface ActivitySummary {
  id: string;
  userId: string;
  userName: string;
  role: UserRole;
  missionId: string;
  missionTitle: string;
  action: "accepted" | "dismissed" | "unanswered" | "completed";
  weekKey: string;
  dayKey: string;
  createdAt: string;
}

export type AppTheme = "light" | "dark" | "red" | "teal" | "crimson" | "midnight" | "sunset" | "amethyst";
export type AppLanguage = "de" | "en";

// Category, measures and injury sites are free text. These lists only drive the
// suggestion chips — they never restrict what can be stored.
export const CATEGORY_SUGGESTIONS = [
  "injury_sport", "fall", "cut_wound", "bruise", "nosebleed", "head_injury",
  "faint", "dizziness", "nausea_vomiting", "headache", "abdominal_pain",
  "allergic_reaction", "asthma", "seizure", "insect_sting", "burn",
  "dental", "psychological", "circulatory",
] as const;

export const MEASURE_SUGGESTIONS = [
  "wound_cleaning", "plaster", "bandage", "cooling", "elevation",
  "recovery_position", "rest", "fluids", "reassurance", "immobilization",
  "cpr", "aed", "epipen", "inhaler",
] as const;

export const BODY_REGIONS_FRONT = [
  "head", "face", "neck", "shoulder_l", "shoulder_r", "chest",
  "upper_arm_l", "upper_arm_r", "abdomen", "forearm_l", "forearm_r",
  "hand_l", "hand_r", "pelvis", "thigh_l", "thigh_r",
  "knee_l", "knee_r", "shin_l", "shin_r", "foot_l", "foot_r",
] as const;

export const BODY_REGIONS_BACK = [
  "back_head", "nape", "shoulder_blade_l", "shoulder_blade_r", "upper_back",
  "lower_back", "elbow_l", "elbow_r", "buttocks", "hamstring_l", "hamstring_r",
  "calf_l", "calf_r", "heel_l", "heel_r",
] as const;

export type IncidentOutcome =
  | "back_to_class" | "rest_then_return" | "sent_home" | "picked_up_by_parents"
  | "family_doctor" | "ambulance_112" | "hospital" | "other";

export type PatientType = "student" | "teacher" | "visitor" | "other";
export type AvpuScore = "A" | "V" | "P" | "U";
export type ReportStatus = "draft" | "submitted";

export interface ReportAddendum {
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface IncidentReport {
  id: string;
  schoolId?: string | null;
  missionId?: string | null;
  authorId: string;
  status: ReportStatus;
  // Patient (restricted)
  patientType?: PatientType | null;
  patientFirstName?: string | null;
  patientLastName?: string | null;
  patientClass?: string | null;
  patientAge?: number | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  // Incident
  incidentAt?: string | null;
  location?: string | null;
  careStartedAt?: string | null;
  careEndedAt?: string | null;
  category?: string | null;
  description?: string | null;
  injurySites?: string | null;
  // Treatment
  measures?: string | null;
  treatmentNotes?: string | null;
  // Vitals
  pulseBpm?: number | null;
  spo2?: number | null;
  respRate?: number | null;
  bloodPressure?: string | null;
  consciousnessAvpu?: AvpuScore | null;
  painScore?: number | null;
  // Outcome
  outcome?: IncidentOutcome | null;
  outcomeNotes?: string | null;
  // People
  responderIds?: string[] | null;
  witnesses?: string | null;
  // Meta
  addenda?: ReportAddendum[] | null;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
}

// --- Owner-only database console ---

export interface SqlPreset {
  key: string;
  group: string;
  label: string;
  description: string;
  sql: string;
  destructive: boolean;
}

export interface DbConsoleResult {
  kind: "read" | "write";
  unbounded: boolean;
  committed: boolean;
  /** True when a write ran but was rolled back, so the count is a forecast. */
  preview: boolean;
  rowsAffected: number;
  fields: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
}
