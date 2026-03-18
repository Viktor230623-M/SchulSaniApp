import type {
  DutyStatus,
  HolidayItem,
  Mission,
  NewsItem,
  NotificationItem,
  User,
} from "@/models";

const MOCK_DELAY = 600;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MOCK_USER: User = {
  id: "u-001",
  firstName: "Max",
  lastName: "Müller",
  email: "max.mueller@schule.de",
  phone: "+49 151 12345678",
  role: "paramedic",
  schoolId: "school-001",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

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
    description: "Sprunggelenksverletzung im Sportunterricht, möglicherweise Verstauchung.",
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
    description: "Schüler hat allergische Reaktion nach Mittagessen in der Mensa.",
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

const MOCK_NEWS: NewsItem[] = [
  {
    id: "n-001",
    title: "Neues Erste-Hilfe-Training im März",
    summary: "Auffrischungskurs für alle Sanitäter am 15. März in der Aula.",
    content:
      "Wir laden alle Schulsanitäter herzlich zu unserem jährlichen Auffrischungskurs ein. Der Kurs findet am 15. März von 14:00 bis 17:00 Uhr in der Schulaula statt. Themen: Wiederbelebung, Wundversorgung, Schockbehandlung. Bitte meldet euch bis zum 10. März an.",
    category: "training",
    publishedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    author: "Dr. Schneider",
    isRead: false,
  },
  {
    id: "n-002",
    title: "Neue AED-Geräte installiert",
    summary: "Zwei neue Defibrillatoren wurden im Schulgebäude installiert.",
    content:
      "Wir freuen uns mitteilen zu können, dass zwei neue AED-Geräte (Automatisierte Externe Defibrillatoren) in der Schule installiert wurden. Standorte: Eingangsbereich Gebäude A und Sporthalle. Eine kurze Einweisung findet nächste Woche statt.",
    category: "update",
    publishedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    author: "Schulleitung",
    isRead: true,
  },
  {
    id: "n-003",
    title: "Wichtig: Dienstplanänderung",
    summary: "Dienstplan für Februar wurde aktualisiert. Bitte prüfen.",
    content:
      "Der Dienstplan für den Monat Februar wurde aufgrund von Schulferiengrenzen angepasst. Bitte überprüft eure zugewiesenen Schichten in der App. Bei Fragen meldet euch beim Koordinator.",
    category: "announcement",
    publishedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    author: "Koordination",
    isRead: false,
  },
];

const MOCK_HOLIDAYS: HolidayItem[] = [
  {
    id: "h-001",
    name: "Osterferien",
    startDate: "2025-04-14",
    endDate: "2025-04-25",
    type: "school",
    state: "NRW",
  },
  {
    id: "h-002",
    name: "Karfreitag",
    startDate: "2025-04-18",
    endDate: "2025-04-18",
    type: "public",
  },
  {
    id: "h-003",
    name: "Ostermontag",
    startDate: "2025-04-21",
    endDate: "2025-04-21",
    type: "public",
  },
  {
    id: "h-004",
    name: "Pfingstferien",
    startDate: "2025-06-09",
    endDate: "2025-06-20",
    type: "school",
    state: "NRW",
  },
  {
    id: "h-005",
    name: "Tag der Arbeit",
    startDate: "2025-05-01",
    endDate: "2025-05-01",
    type: "public",
  },
  {
    id: "h-006",
    name: "Sommerferien",
    startDate: "2025-07-07",
    endDate: "2025-08-19",
    type: "school",
    state: "NRW",
  },
];

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-001",
    type: "mission_assigned",
    title: "Einsatz zugewiesen",
    body: "Du wurdest für den Einsatz 'Ohnmacht auf dem Schulhof' eingeteilt.",
    isRead: false,
    createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
    relatedId: "m-001",
  },
  {
    id: "notif-002",
    type: "news",
    title: "Neue Neuigkeit",
    body: "Neues Erste-Hilfe-Training im März wurde veröffentlicht.",
    isRead: false,
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    relatedId: "n-001",
  },
  {
    id: "notif-003",
    type: "reminder",
    title: "Dienstbeginn in 30 Minuten",
    body: "Dein Dienst beginnt in 30 Minuten. Bitte sei pünktlich.",
    isRead: true,
    createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
  },
  {
    id: "notif-004",
    type: "status_changed",
    title: "Statusänderung",
    body: "Dein Dienststatus wurde auf 'Im Dienst' gesetzt.",
    isRead: true,
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
  },
];

// ─── ApiService ────────────────────────────────────────────────────────────

const ApiService = {
  // GET /user/me
  async getCurrentUser(): Promise<User> {
    await delay(MOCK_DELAY);
    return { ...MOCK_USER };
  },

  // GET /missions
  async getMissions(): Promise<Mission[]> {
    await delay(MOCK_DELAY);
    return [...MOCK_MISSIONS];
  },

  // POST /missions/:id/accept
  async acceptMission(id: string): Promise<Mission> {
    await delay(MOCK_DELAY);
    const mission = MOCK_MISSIONS.find((m) => m.id === id);
    if (!mission) throw new Error("Mission not found");
    mission.status = "accepted";
    return { ...mission };
  },

  // POST /missions/:id/reject
  async rejectMission(id: string): Promise<Mission> {
    await delay(MOCK_DELAY);
    const mission = MOCK_MISSIONS.find((m) => m.id === id);
    if (!mission) throw new Error("Mission not found");
    mission.status = "rejected";
    return { ...mission };
  },

  // GET /news
  async getNews(): Promise<NewsItem[]> {
    await delay(MOCK_DELAY);
    return [...MOCK_NEWS];
  },

  // POST /news/:id/read
  async markNewsRead(id: string): Promise<void> {
    await delay(200);
    const item = MOCK_NEWS.find((n) => n.id === id);
    if (item) item.isRead = true;
  },

  // GET /holidays
  async getHolidays(): Promise<HolidayItem[]> {
    await delay(MOCK_DELAY);
    return [...MOCK_HOLIDAYS];
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
  async getDutyStatus(userId: string): Promise<DutyStatus> {
    await delay(MOCK_DELAY);
    return {
      userId,
      status: "off_duty",
      updatedAt: new Date().toISOString(),
    };
  },

  // POST /status
  async updateDutyStatus(status: DutyStatus["status"]): Promise<DutyStatus> {
    await delay(MOCK_DELAY);
    return {
      userId: MOCK_USER.id,
      status,
      updatedAt: new Date().toISOString(),
    };
  },
};

export default ApiService;
