import type {
  DutyStatus,
  LOARequest,
  Mission,
  NewsItem,
  NotificationItem,
  User,
} from "@/models";

const MOCK_DELAY = 600;
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uid() {
  return Date.now().toString() + Math.random().toString(36).substring(2, 9);
}

// ─── Mock Users ──────────────────────────────────────────────────────────────

export const MOCK_USERS: User[] = [
  {
    id: "u-001",
    firstName: "Max",
    lastName: "Müller",
    email: "max.mueller@schule.de",
    phone: "+49 151 12345678",
    role: "student_paramedic",
    schoolId: "school-001",
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// mock on-duty users
export const MOCK_ON_DUTY_USER_IDS = ["u-001", "u-003"];

// ─── Mock Missions ────────────────────────────────────────────────────────────

const MOCK_MISSIONS: Mission[] = [
  {
    id: "m-001",
    title: "Ohnmacht auf dem Schulhof",
    description: "Schüler ist auf dem Pausenhof kollabiert, reagiert kaum.",
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
    description: "Sprunggelenksverletzung, möglicherweise Verstauchung.",
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
    description: "Allergische Reaktion nach Mittagessen in der Mensa.",
    location: "Mensa, EG",
    priority: "high",
    status: "accepted",
    requestedAt: new Date(Date.now() - 45 * 60000).toISOString(),
    scheduledFor: new Date(Date.now() - 30 * 60000).toISOString(),
    patientInfo: "Schüler, 12 Jahre, männlich, Erdnussallergie bekannt",
  },
  {
    id: "m-004",
    title: "Kopfschmerzen / Schwindel",
    description: "Lehrerin klagt über starke Kopfschmerzen und Schwindel.",
    location: "Lehrerzimmer, 1. OG",
    priority: "low",
    status: "rejected",
    requestedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    scheduledFor: new Date(Date.now() - 1.5 * 3600000).toISOString(),
    patientInfo: "Lehrerin, 45 Jahre, weiblich",
  },
];

// ─── Mock News ────────────────────────────────────────────────────────────────

const MOCK_NEWS: NewsItem[] = [
  {
    id: "n-001",
    title: "Neues Erste-Hilfe-Training im März",
    summary: "Auffrischungskurs für alle Sanitäter am 15. März in der Aula.",
    content:
      "Wir laden alle Schulsanitäter herzlich zu unserem jährlichen Auffrischungskurs ein. Der Kurs findet am 15. März von 14:00 bis 17:00 Uhr in der Schulaula statt. Themen: Wiederbelebung, Wundversorgung, Schockbehandlung. Bitte meldet euch bis zum 10. März an.",
    category: "training",
    status: "approved",
    publishedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    author: "Dr. Schneider",
    authorId: "u-004",
    isRead: false,
  },
  {
    id: "n-002",
    title: "Neue AED-Geräte installiert",
    summary: "Zwei neue Defibrillatoren wurden im Schulgebäude installiert.",
    content:
      "Wir freuen uns mitteilen zu können, dass zwei neue AED-Geräte (Automatisierte Externe Defibrillatoren) in der Schule installiert wurden. Standorte: Eingangsbereich Gebäude A und Sporthalle.",
    category: "update",
    status: "approved",
    publishedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    author: "Schulleitung",
    authorId: "u-002",
    isRead: true,
  },
  {
    id: "n-003",
    title: "Wichtig: Dienstplanänderung",
    summary: "Dienstplan für Februar wurde aktualisiert. Bitte prüfen.",
    content:
      "Der Dienstplan für den Monat Februar wurde aufgrund von Schulferiengrenzen angepasst. Bitte überprüft eure zugewiesenen Schichten.",
    category: "announcement",
    status: "pending",
    publishedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    author: "Koordination",
    authorId: "u-001",
    isRead: false,
  },
  {
    id: "n-004",
    title: "Neue Hygieneregelung",
    summary: "Neue Hygienerichtlinien für den Sanitätsdienst wurden erlassen.",
    content: "Details zu den neuen Hygienerichtlinien für den Sanitätsdienst.",
    category: "alert",
    status: "rejected",
    publishedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    author: "Max Müller",
    authorId: "u-001",
    isRead: false,
    rejectionReason: "Bitte füge weitere Details zu den Richtlinien hinzu.",
  },
];

// ─── Mock LOA ─────────────────────────────────────────────────────────────────

const MOCK_LOA: LOARequest[] = [
  {
    id: "loa-001",
    userId: "u-001",
    userName: "Max Müller",
    fromDate: "2025-04-14",
    toDate: "2025-04-18",
    reason: "Familienurlaub über Ostern",
    status: "approved",
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    adminNote: "Genehmigt. Viel Erholung!",
    reviewedBy: "Anna Schmidt",
    reviewedAt: new Date(Date.now() - 12 * 86400000).toISOString(),
  },
  {
    id: "loa-002",
    userId: "u-001",
    userName: "Max Müller",
    fromDate: "2025-05-05",
    toDate: "2025-05-07",
    reason: "Arzttermin und Erholung",
    status: "pending",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "loa-003",
    userId: "u-003",
    userName: "Peter Weber",
    fromDate: "2025-03-20",
    toDate: "2025-03-21",
    reason: "Fortbildung außerhalb",
    status: "rejected",
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    adminNote: "Wir brauchen dich zu diesem Zeitpunkt.",
    reviewedBy: "Anna Schmidt",
    reviewedAt: new Date(Date.now() - 18 * 86400000).toISOString(),
  },
];

// ─── Mock Notifications ───────────────────────────────────────────────────────

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-001",
    type: "high_priority_alert",
    title: "Notfall: AED-Gerät defekt!",
    body: "Der AED in der Sporthalle ist ausgefallen. Sofort melden!",
    isRead: false,
    priority: "high",
    createdAt: new Date(Date.now() - 10 * 60000).toISOString(),
  },
  {
    id: "notif-002",
    type: "mission_assigned",
    title: "Einsatz zugewiesen",
    body: "Du wurdest für den Einsatz 'Ohnmacht auf dem Schulhof' eingeteilt.",
    isRead: false,
    priority: "normal",
    createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
    relatedId: "m-001",
  },
  {
    id: "notif-003",
    type: "loa_update",
    title: "LOA genehmigt",
    body: "Dein Urlaubsantrag vom 14.04. - 18.04. wurde genehmigt.",
    isRead: false,
    priority: "normal",
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    relatedId: "loa-001",
  },
  {
    id: "notif-004",
    type: "news",
    title: "Neue Neuigkeit",
    body: "Neues Erste-Hilfe-Training im März wurde veröffentlicht.",
    isRead: true,
    priority: "normal",
    createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    relatedId: "n-001",
  },
  {
    id: "notif-005",
    type: "reminder",
    title: "Dienstbeginn in 30 Minuten",
    body: "Dein Dienst beginnt in 30 Minuten. Bitte sei pünktlich.",
    isRead: true,
    priority: "normal",
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
  },
];

// ─── ApiService ────────────────────────────────────────────────────────────

const ApiService = {
  // POST /auth/login
  async login(credentials: {
    username: string;
    password: string;
  }): Promise<User> {
    await delay(MOCK_DELAY);
    // Mock: admin@school.de / admin → admin user; anything else → student
    const isAdmin =
      credentials.username.toLowerCase().includes("admin") ||
      credentials.username === "admin";
    const isTeacher = credentials.username.toLowerCase().includes("lehrer");
    const isLeitung = credentials.username.toLowerCase().includes("leitung");
    if (isAdmin) return { ...MOCK_USERS[1] };
    if (isTeacher) return { ...MOCK_USERS[3] };
    if (isLeitung) return { ...MOCK_USERS[2] };
    return { ...MOCK_USERS[0] };
  },

  // POST /auth/logout
  async logout(): Promise<void> {
    await delay(300);
  },

  // GET /users
  async getAllUsers(): Promise<User[]> {
    await delay(MOCK_DELAY);
    return [...MOCK_USERS];
  },

  // GET /users/on-duty
  async getOnDutyUsers(): Promise<User[]> {
    await delay(MOCK_DELAY);
    return MOCK_USERS.filter((u) =>
      MOCK_ON_DUTY_USER_IDS.includes(u.id)
    );
  },

  // GET /missions
  async getMissions(): Promise<Mission[]> {
    await delay(MOCK_DELAY);
    return [...MOCK_MISSIONS];
  },

  // POST /missions/:id/accept
  async acceptMission(id: string): Promise<Mission> {
    await delay(400);
    const m = MOCK_MISSIONS.find((m) => m.id === id);
    if (!m) throw new Error("Mission not found");
    m.status = "accepted";
    return { ...m };
  },

  // POST /missions/:id/reject
  async rejectMission(id: string): Promise<Mission> {
    await delay(400);
    const m = MOCK_MISSIONS.find((m) => m.id === id);
    if (!m) throw new Error("Mission not found");
    m.status = "rejected";
    return { ...m };
  },

  // GET /news
  async getNews(): Promise<NewsItem[]> {
    await delay(MOCK_DELAY);
    return [...MOCK_NEWS];
  },

  // POST /news
  async createNews(
    item: Omit<NewsItem, "id" | "publishedAt" | "status" | "isRead">
  ): Promise<NewsItem> {
    await delay(400);
    const newItem: NewsItem = {
      ...item,
      id: uid(),
      publishedAt: new Date().toISOString(),
      status: "pending",
      isRead: false,
    };
    MOCK_NEWS.unshift(newItem);
    return newItem;
  },

  // POST /news/:id/approve
  async approveNews(id: string): Promise<NewsItem> {
    await delay(400);
    const n = MOCK_NEWS.find((n) => n.id === id);
    if (!n) throw new Error("Not found");
    n.status = "approved";
    return { ...n };
  },

  // POST /news/:id/reject
  async rejectNews(id: string, reason: string): Promise<NewsItem> {
    await delay(400);
    const n = MOCK_NEWS.find((n) => n.id === id);
    if (!n) throw new Error("Not found");
    n.status = "rejected";
    n.rejectionReason = reason;
    return { ...n };
  },

  // POST /news/:id/read
  async markNewsRead(id: string): Promise<void> {
    await delay(200);
    const n = MOCK_NEWS.find((n) => n.id === id);
    if (n) n.isRead = true;
  },

  // POST /news/read-all
  async markAllNewsRead(): Promise<void> {
    await delay(200);
    MOCK_NEWS.forEach((n) => (n.isRead = true));
  },

  // GET /loa
  async getLOARequests(userId?: string): Promise<LOARequest[]> {
    await delay(MOCK_DELAY);
    if (userId) return MOCK_LOA.filter((r) => r.userId === userId);
    return [...MOCK_LOA];
  },

  // POST /loa
  async createLOA(
    req: Omit<LOARequest, "id" | "createdAt" | "status">
  ): Promise<LOARequest> {
    await delay(400);
    const newReq: LOARequest = {
      ...req,
      id: uid(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    MOCK_LOA.unshift(newReq);
    return newReq;
  },

  // POST /loa/:id/approve
  async approveLOA(id: string, note?: string): Promise<LOARequest> {
    await delay(400);
    const r = MOCK_LOA.find((r) => r.id === id);
    if (!r) throw new Error("Not found");
    r.status = "approved";
    r.adminNote = note;
    r.reviewedAt = new Date().toISOString();
    return { ...r };
  },

  // POST /loa/:id/reject
  async rejectLOA(id: string, reason: string): Promise<LOARequest> {
    await delay(400);
    const r = MOCK_LOA.find((r) => r.id === id);
    if (!r) throw new Error("Not found");
    r.status = "rejected";
    r.adminNote = reason;
    r.reviewedAt = new Date().toISOString();
    return { ...r };
  },

  // POST /loa/:id/appeal
  async appealLOA(id: string, appealNote: string): Promise<LOARequest> {
    await delay(400);
    const r = MOCK_LOA.find((r) => r.id === id);
    if (!r) throw new Error("Not found");
    r.status = "appealed";
    r.appealNote = appealNote;
    return { ...r };
  },

  // GET /notifications
  async getNotifications(): Promise<NotificationItem[]> {
    await delay(MOCK_DELAY);
    return [...MOCK_NOTIFICATIONS];
  },

  // POST /notifications/read-all
  async markAllNotificationsRead(): Promise<void> {
    await delay(200);
    MOCK_NOTIFICATIONS.forEach((n) => (n.isRead = true));
  },

  // GET /status
  async getDutyStatus(): Promise<DutyStatus> {
    await delay(MOCK_DELAY);
    return { userId: "u-001", status: "off_duty", updatedAt: new Date().toISOString() };
  },

  // POST /status
  async updateDutyStatus(status: DutyStatus["status"]): Promise<DutyStatus> {
    await delay(400);
    return { userId: "u-001", status, updatedAt: new Date().toISOString() };
  },
};

export default ApiService;
