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

// ─── Mock Users ───────────────────────────────────────────────────────────────

export const MOCK_USERS: User[] = [
  {
    id: "u-001",
    firstName: "Viktor",
    lastName: "Gnjatić",
    email: "viktor.gnjatic@schule.de",
    phone: "+49 151 99988877",
    role: "cto",
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
  {
    id: "u-005",
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
    id: "u-006",
    firstName: "Lena",
    lastName: "Fischer",
    email: "lena.fischer@schule.de",
    phone: "+49 151 22334455",
    role: "student_paramedic",
    schoolId: "school-001",
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Login credential map: username (lowercase) → user id
const CREDENTIAL_MAP: Record<string, string> = {
  "viktor.gnjatic": "u-001",
  "viktor": "u-001",
  "admin": "u-002",
  "anna.schmidt": "u-002",
  "anna": "u-002",
  "leitung": "u-003",
  "peter.weber": "u-003",
  "peter": "u-003",
  "lehrer": "u-004",
  "dr.bauer": "u-004",
  "bauer": "u-004",
  "max.mueller": "u-005",
  "max": "u-005",
  "lena.fischer": "u-006",
  "lena": "u-006",
  "jonas.braun": "u-007",
  "jonas": "u-007",
};

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
    patientInfo: "Schüler, 12 Jahre, Erdnussallergie bekannt",
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
    patientInfo: "Lehrerin, 45 Jahre",
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
    author: "Dr. Klaus Bauer",
    authorId: "u-004",
    isRead: false,
  },
  {
    id: "n-002",
    title: "Neue AED-Geräte installiert",
    summary: "Zwei neue Defibrillatoren wurden im Schulgebäude installiert.",
    content:
      "Wir freuen uns mitteilen zu können, dass zwei neue AED-Geräte in der Schule installiert wurden. Standorte: Eingangsbereich Gebäude A und Sporthalle.",
    category: "update",
    status: "approved",
    publishedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    author: "Anna Schmidt",
    authorId: "u-002",
    isRead: true,
  },
  {
    id: "n-003",
    title: "Dienstplanänderung Februar",
    summary: "Dienstplan für Februar wurde aktualisiert. Bitte prüfen.",
    content:
      "Der Dienstplan für Februar wurde aufgrund von Schulferiengrenzen angepasst. Bitte überprüft eure zugewiesenen Schichten.",
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
    content:
      "Hallo zusammen! Als CTO möchte ich euch über unsere Q2-Roadmap informieren: 1. Echtzeit-Benachrichtigungen via Push, 2. Integration mit dem Schulverwaltungssystem, 3. Offline-Modus für kritische Daten. Feedback willkommen!",
    category: "announcement",
    status: "approved",
    publishedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    author: "Viktor Gnjatić",
    authorId: "u-001",
    isRead: false,
  },
  {
    id: "n-005",
    title: "Hygieneregelung überarbeitet",
    summary: "Neue Hygienerichtlinien für den Sanitätsdienst wurden erlassen.",
    content: "Bitte überarbeite diesen Beitrag mit mehr Details zu den Richtlinien.",
    category: "alert",
    status: "rejected",
    publishedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    author: "Lena Fischer",
    authorId: "u-006",
    isRead: false,
    rejectionReason: "Zu wenig Informationen. Bitte ergänze konkrete Maßnahmen.",
  },
  {
    id: "n-006",
    title: "Sanitäterdienst bei Schulfest",
    summary: "Für das Schulfest am 20.03. werden 4 Sanitäter benötigt.",
    content:
      "Beim diesjährigen Schulfest am 20.03. von 12:00 bis 18:00 Uhr sind 4 Sanitäter im Einsatz. Bitte tragt euch bis Freitag in die Liste ein.",
    category: "announcement",
    status: "pending",
    publishedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    author: "Peter Weber",
    authorId: "u-003",
    isRead: false,
  },
];

// ─── Mock LOA ────────────────────────────────────────────────────────────────

const MOCK_LOA: LOARequest[] = [
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
  {
    id: "loa-004",
    userId: "u-006",
    userName: "Lena Fischer",
    fromDate: "2025-04-28",
    toDate: "2025-04-30",
    reason: "Abitur-Prüfungsvorbereitung",
    status: "pending",
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: "loa-005",
    userId: "u-001",
    userName: "Viktor Gnjatić",
    fromDate: "2025-06-01",
    toDate: "2025-06-10",
    reason: "Tech-Konferenz in Berlin",
    status: "approved",
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    adminNote: "Genehmigt – viel Erfolg auf der Konferenz!",
    reviewedBy: "Anna Schmidt",
    reviewedAt: new Date(Date.now() - 28 * 86400000).toISOString(),
  },
  {
    id: "loa-006",
    userId: "u-007",
    userName: "Jonas Braun",
    fromDate: "2025-03-25",
    toDate: "2025-03-26",
    reason: "Familienangelegenheit",
    status: "appealed",
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
    adminNote: "Kurzfristig nicht möglich.",
    appealNote: "Dringende Familienangelegenheit, bitte nochmals prüfen.",
    reviewedBy: "Dr. Klaus Bauer",
    reviewedAt: new Date(Date.now() - 22 * 86400000).toISOString(),
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
    body: "Dein LOA-Antrag vom 14.04.–18.04. wurde genehmigt.",
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

// ─── ApiService ───────────────────────────────────────────────────────────────

const ApiService = {
  // POST /auth/login
  async login(credentials: { username: string; password: string }): Promise<{
    user: User;
    isTealUnlocked: boolean;
  }> {
    await delay(MOCK_DELAY);
    const key = credentials.username.toLowerCase().trim().replace(/\s+/g, ".");
    const userId = CREDENTIAL_MAP[key];

    // Special CTO teal unlock
    const isTealUnlocked =
      credentials.username.toLowerCase() === "viktor.gnjatic" &&
      credentials.password === "viktor.gnjatic";

    const user = userId
      ? MOCK_USERS.find((u) => u.id === userId)!
      : MOCK_USERS[4]; // default: Max Müller (student)

    return { user: { ...user }, isTealUnlocked };
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
    return [MOCK_USERS[2], MOCK_USERS[4]]; // Peter Weber + Max Müller
  },

  // GET /missions
  async getMissions(): Promise<Mission[]> {
    await delay(MOCK_DELAY);
    return [...MOCK_MISSIONS];
  },

  async acceptMission(id: string): Promise<Mission> {
    await delay(400);
    const m = MOCK_MISSIONS.find((m) => m.id === id);
    if (!m) throw new Error("Not found");
    m.status = "accepted";
    return { ...m };
  },

  async rejectMission(id: string): Promise<Mission> {
    await delay(400);
    const m = MOCK_MISSIONS.find((m) => m.id === id);
    if (!m) throw new Error("Not found");
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

  async approveNews(id: string): Promise<NewsItem> {
    await delay(400);
    const n = MOCK_NEWS.find((n) => n.id === id);
    if (!n) throw new Error("Not found");
    n.status = "approved";
    return { ...n };
  },

  async rejectNews(id: string, reason: string): Promise<NewsItem> {
    await delay(400);
    const n = MOCK_NEWS.find((n) => n.id === id);
    if (!n) throw new Error("Not found");
    n.status = "rejected";
    n.rejectionReason = reason;
    return { ...n };
  },

  async deleteNews(id: string): Promise<void> {
    await delay(300);
    const idx = MOCK_NEWS.findIndex((n) => n.id === id);
    if (idx !== -1) MOCK_NEWS.splice(idx, 1);
  },

  async markNewsRead(id: string): Promise<void> {
    await delay(200);
    const n = MOCK_NEWS.find((n) => n.id === id);
    if (n) n.isRead = true;
  },

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

  async approveLOA(id: string, note?: string): Promise<LOARequest> {
    await delay(400);
    const r = MOCK_LOA.find((r) => r.id === id);
    if (!r) throw new Error("Not found");
    r.status = "approved";
    r.adminNote = note;
    r.reviewedAt = new Date().toISOString();
    return { ...r };
  },

  async rejectLOA(id: string, reason: string): Promise<LOARequest> {
    await delay(400);
    const r = MOCK_LOA.find((r) => r.id === id);
    if (!r) throw new Error("Not found");
    r.status = "rejected";
    r.adminNote = reason;
    r.reviewedAt = new Date().toISOString();
    return { ...r };
  },

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

  async markAllNotificationsRead(): Promise<void> {
    await delay(200);
    MOCK_NOTIFICATIONS.forEach((n) => (n.isRead = true));
  },

  // GET /status
  async getDutyStatus(): Promise<DutyStatus> {
    await delay(MOCK_DELAY);
    return { userId: "u-001", status: "off_duty", updatedAt: new Date().toISOString() };
  },

  async updateDutyStatus(status: DutyStatus["status"]): Promise<DutyStatus> {
    await delay(400);
    return { userId: "u-001", status, updatedAt: new Date().toISOString() };
  },
};

export default ApiService;
