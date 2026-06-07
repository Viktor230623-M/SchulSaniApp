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

export type IncidentCategory =
  | "injury_sport" | "fall" | "cut_wound" | "bruise" | "nosebleed" | "head_injury"
  | "faint" | "dizziness" | "nausea_vomiting" | "headache" | "abdominal_pain"
  | "allergic_reaction" | "asthma" | "seizure" | "insect_sting" | "burn"
  | "dental" | "psychological" | "circulatory" | "other";

export type IncidentOutcome =
  | "back_to_class" | "rest_then_return" | "sent_home" | "picked_up_by_parents"
  | "family_doctor" | "ambulance_112" | "hospital" | "other";

export type TreatmentMeasure =
  | "wound_cleaning" | "plaster" | "bandage" | "cooling" | "elevation"
  | "recovery_position" | "rest" | "fluids" | "reassurance" | "immobilization"
  | "cpr" | "aed" | "epipen" | "inhaler" | "other";

export type PatientType = "student" | "staff" | "visitor" | "other";
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
  // Incident
  incidentAt?: string | null;
  location?: string | null;
  careStartedAt?: string | null;
  careEndedAt?: string | null;
  category?: IncidentCategory | null;
  description?: string | null;
  // Treatment
  measures?: TreatmentMeasure[] | null;
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
