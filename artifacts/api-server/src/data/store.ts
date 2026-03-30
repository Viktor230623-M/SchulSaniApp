import bcrypt from "bcryptjs";

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
  passwordHash: string;
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
  isRead: boolean;
  rejectionReason?: string;
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

export type DutyStatusType = "on_duty" | "off_duty";

export interface DutyEntry {
  userId: string;
  status: DutyStatusType;
  updatedAt: string;
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
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  priority: "normal" | "high";
  createdAt: string;
  relatedId?: string;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// ─── Seeded Data ──────────────────────────────────────────────────────────────

export const USERS: User[] = [
  {
    id: "u-001",
    firstName: "Viktor",
    lastName: "Gnjatić",
    email: "viktor.gnjatic@schule.de",
    phone: "+49 151 99988877",
    role: "cto",
    schoolId: "school-001",
    passwordHash: bcrypt.hashSync("viktor.gnjatic", 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "u-002",
    firstName: "Anna",
    lastName: "Schmidt",
    email: "anna.schmidt@schule.de",
    phone: "+49 151 87654321",
    role: "admin",
    schoolId: "school-001",
    passwordHash: bcrypt.hashSync("admin123", 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "u-003",
    firstName: "Peter",
    lastName: "Weber",
    email: "peter.weber@schule.de",
    phone: "+49 151 11223344",
    role: "sanitaeter_leitung",
    schoolId: "school-001",
    passwordHash: bcrypt.hashSync("leitung123", 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "u-004",
    firstName: "Dr. Klaus",
    lastName: "Bauer",
    email: "k.bauer@schule.de",
    phone: "+49 151 55667788",
    role: "teacher",
    schoolId: "school-001",
    passwordHash: bcrypt.hashSync("lehrer123", 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "u-005",
    firstName: "Max",
    lastName: "Müller",
    email: "max.mueller@schule.de",
    phone: "+49 151 12345678",
    role: "student_paramedic",
    schoolId: "school-001",
    passwordHash: bcrypt.hashSync("student123", 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "u-006",
    firstName: "Lena",
    lastName: "Fischer",
    email: "lena.fischer@schule.de",
    phone: "+49 151 22334455",
    role: "student_paramedic",
    schoolId: "school-001",
    passwordHash: bcrypt.hashSync("student123", 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "u-007",
    firstName: "Jonas",
    lastName: "Braun",
    email: "jonas.braun@schule.de",
    phone: "+49 151 33445566",
    role: "student_paramedic",
    schoolId: "school-001",
    passwordHash: bcrypt.hashSync("student123", 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const MISSIONS: Mission[] = [
  {
    id: "m-001",
    title: "Ohnmacht auf dem Schulhof",
    description: "Schüler ist auf dem Pausenhof kollabiert.",
    location: "Schulhof, Gebäude A",
    priority: "high",
    status: "pending",
    requestedAt: new Date(Date.now() - 5 * 60000).toISOString(),
    scheduledFor: new Date(Date.now() + 10 * 60000).toISOString(),
    patientInfo: "Schüler, 14 Jahre, männlich",
  },
  {
    id: "m-002",
    title: "Verletzung beim Sport",
    description: "Sprunggelenksverletzung in der Sporthalle.",
    location: "Sporthalle",
    priority: "medium",
    status: "pending",
    requestedAt: new Date(Date.now() - 20 * 60000).toISOString(),
    scheduledFor: new Date(Date.now() + 30 * 60000).toISOString(),
    patientInfo: "Schülerin, 16 Jahre, weiblich",
  },
  {
    id: "m-003",
    title: "Allergische Reaktion",
    description: "Allergische Reaktion nach dem Mittagessen.",
    location: "Mensa, EG",
    priority: "high",
    status: "accepted",
    requestedAt: new Date(Date.now() - 45 * 60000).toISOString(),
    scheduledFor: new Date(Date.now() - 30 * 60000).toISOString(),
    patientInfo: "Schüler, 12 Jahre, Erdnussallergie",
  },
];

export const NEWS: NewsItem[] = [
  {
    id: "n-001",
    title: "Neues Erste-Hilfe-Training im März",
    summary: "Auffrischungskurs am 15. März in der Aula.",
    content: "Wir laden alle Schulsanitäter herzlich zu unserem Auffrischungskurs ein. 15. März, 14:00–17:00 Uhr, Schulaula. Anmeldung bis 10. März.",
    category: "training",
    status: "approved",
    publishedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    author: "Dr. Klaus Bauer",
    authorId: "u-004",
    isRead: false,
  },
  {
    id: "n-002",
    title: "Neue AED-Geräte installiert",
    summary: "Zwei neue Defibrillatoren im Schulgebäude.",
    content: "Neue AED-Geräte bei Eingang Gebäude A und in der Sporthalle.",
    category: "update",
    status: "approved",
    publishedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    author: "Anna Schmidt",
    authorId: "u-002",
    isRead: false,
  },
  {
    id: "n-003",
    title: "Dienstplanänderung Februar",
    summary: "Dienstplan wurde aktualisiert.",
    content: "Der Dienstplan für Februar wurde angepasst. Bitte überprüft eure Schichten.",
    category: "announcement",
    status: "pending",
    publishedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    author: "Max Müller",
    authorId: "u-005",
    isRead: false,
  },
  {
    id: "n-004",
    title: "CTO-Update: App Roadmap Q2",
    summary: "Viktor teilt die geplanten Features für Q2 mit.",
    content: "Q2 Roadmap: Push-Benachrichtigungen, Schulverwaltungs-Integration, Offline-Modus.",
    category: "announcement",
    status: "approved",
    publishedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    author: "Viktor Gnjatić",
    authorId: "u-001",
    isRead: false,
  },
];

export const LOA_REQUESTS: LOARequest[] = [
  {
    id: "loa-001",
    userId: "u-005",
    userName: "Max Müller",
    fromDate: "2025-04-14",
    toDate: "2025-04-18",
    reason: "Familienurlaub über Ostern",
    status: "approved",
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    adminNote: "Genehmigt. Schöne Ostern!",
    reviewedBy: "Anna Schmidt",
    reviewedAt: new Date(Date.now() - 12 * 86400000).toISOString(),
  },
  {
    id: "loa-002",
    userId: "u-005",
    userName: "Max Müller",
    fromDate: "2025-05-05",
    toDate: "2025-05-07",
    reason: "Arzttermin und Erholung",
    status: "pending",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "loa-003",
    userId: "u-001",
    userName: "Viktor Gnjatić",
    fromDate: "2025-06-01",
    toDate: "2025-06-10",
    reason: "Tech-Konferenz in Berlin",
    status: "approved",
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    adminNote: "Genehmigt – viel Erfolg!",
    reviewedBy: "Anna Schmidt",
    reviewedAt: new Date(Date.now() - 28 * 86400000).toISOString(),
  },
];

export const DUTY_STATUS: Map<string, DutyEntry> = new Map([
  ["u-003", { userId: "u-003", status: "on_duty", updatedAt: new Date().toISOString() }],
  ["u-005", { userId: "u-005", status: "on_duty", updatedAt: new Date().toISOString() }],
]);

export const NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-001",
    userId: "u-005",
    type: "high_priority_alert",
    title: "Notfall: AED-Gerät defekt!",
    body: "Der AED in der Sporthalle ist ausgefallen.",
    isRead: false,
    priority: "high",
    createdAt: new Date(Date.now() - 10 * 60000).toISOString(),
  },
  {
    id: "notif-002",
    userId: "u-005",
    type: "loa_update",
    title: "LOA genehmigt",
    body: "Dein LOA-Antrag 14.04.–18.04. wurde genehmigt.",
    isRead: false,
    priority: "normal",
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    relatedId: "loa-001",
  },
];

// ─── Username lookup for login ────────────────────────────────────────────────
export const USERNAME_MAP: Record<string, string> = {
  "viktor.gnjatic": "u-001",
  "viktor": "u-001",
  "anna.schmidt": "u-002",
  "admin": "u-002",
  "peter.weber": "u-003",
  "leitung": "u-003",
  "k.bauer": "u-004",
  "dr.bauer": "u-004",
  "lehrer": "u-004",
  "max.mueller": "u-005",
  "max": "u-005",
  "lena.fischer": "u-006",
  "lena": "u-006",
  "jonas.braun": "u-007",
  "jonas": "u-007",
};

export { uid };
