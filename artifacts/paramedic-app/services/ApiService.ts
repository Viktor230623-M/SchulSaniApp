import type {
  DutyStatus,
  LOARequest,
  Mission,
  NewsItem,
  NotificationItem,
  User,
} from "@/models";

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE = `https://${process.env["EXPO_PUBLIC_DOMAIN"]}/api`;

const MOCK_DELAY = 600;
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

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
    authorId: "teacher-bauer",
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
    author: "Schulverwaltung",
    authorId: "admin-verwaltung",
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
    author: "Sanitäter Leitung",
    authorId: "leitung-001",
    isRead: false,
  },
];

const MOCK_LOA: LOARequest[] = [
  {
    id: "loa-001",
    userId: "my-user",
    userName: "Ich",
    fromDate: "2025-04-14",
    toDate: "2025-04-18",
    reason: "Familienurlaub über Ostern",
    status: "approved",
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    adminNote: "Genehmigt. Schöne Ostern!",
    reviewedBy: "Admin",
    reviewedAt: new Date(Date.now() - 12 * 86400000).toISOString(),
  },
  {
    id: "loa-002",
    userId: "my-user",
    userName: "Ich",
    fromDate: "2025-05-05",
    toDate: "2025-05-07",
    reason: "Arzttermin und Erholung",
    status: "pending",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
];

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
    title: "LoA genehmigt",
    body: "Dein LoA-Antrag vom 14.04.–18.04. wurde genehmigt.",
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
  // POST /auth/login — real IServ authentication via backend
  async login(credentials: { username: string; password: string }): Promise<{
    user: User;
    isTealUnlocked: boolean;
  }> {
    const resp = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: credentials.username.trim(),
        password: credentials.password,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error ?? "Anmeldung fehlgeschlagen");
    }

    return { user: data.user as User, isTealUnlocked: data.isTealUnlocked };
  },

  // POST /auth/logout
  async logout(): Promise<void> {
    await delay(300);
  },

  // GET /users
  async getAllUsers(): Promise<User[]> {
    await delay(MOCK_DELAY);
    return [];
  },

  // GET /users/on-duty
  async getOnDutyUsers(): Promise<User[]> {
    await delay(MOCK_DELAY);
    return [];
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
    if (userId) return MOCK_LOA.filter((r) => r.userId === userId || r.userId === "my-user");
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
