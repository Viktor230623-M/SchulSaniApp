export type UserRole =
  | "cto"
  | "student_paramedic"
  | "sanitaeter_leitung"
  | "admin"
  | "teacher";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: UserRole;
  schoolId: string;
  avatarUri?: string;
  createdAt: string;
  updatedAt: string;
}

export type MissionStatus = "pending" | "accepted" | "rejected" | "completed";
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
}

export type NotificationType =
  | "mission_assigned"
  | "mission_cancelled"
  | "status_changed"
  | "news"
  | "loa_update"
  | "reminder"
  | "high_priority_alert";

export interface NotificationItem {
  id: string;
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
}

export type AppTheme = "light" | "dark" | "red" | "teal" | "crimson" | "midnight" | "sunset" | "amethyst";
export type AppLanguage = "de" | "en";
