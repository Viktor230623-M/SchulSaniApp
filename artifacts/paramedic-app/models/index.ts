export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: "paramedic" | "coordinator" | "admin";
  schoolId: string;
  avatarUrl?: string;
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
  availableFrom?: string;
  availableUntil?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: "announcement" | "training" | "update" | "alert";
  publishedAt: string;
  author: string;
  imageUrl?: string;
  isRead: boolean;
}

export type NotificationType =
  | "mission_assigned"
  | "mission_cancelled"
  | "status_changed"
  | "news"
  | "holiday"
  | "reminder";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  relatedId?: string;
}

export interface HolidayItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  type: "school" | "public";
  state?: string;
}
