import type {
  ActivityLog,
  ActivitySummary,
  DutyStatus,
  LOARequest,
  Mission,
  MissionActivityLog,
  MissionPriority,
  NewsItem,
  NotificationItem,
  User,
} from "@/models";

const API_BASE = `https://${process.env["EXPO_PUBLIC_DOMAIN"]}/api`;

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

function headers() {
  return {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

const ApiService = {
  async login(credentials: { username: string; password: string }): Promise<{ user: User; isTealUnlocked: boolean; token: string }> {
    const resp = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ username: credentials.username.trim(), password: credentials.password }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error ?? "Anmeldung fehlgeschlagen");
    if (data.token) setAuthToken(data.token);
    return { user: data.user as User, isTealUnlocked: data.isTealUnlocked, token: data.token };
  },

  async logout(): Promise<void> {
    setAuthToken(null);
  },

  async getNews(): Promise<NewsItem[]> {
    const resp = await fetch(`${API_BASE}/news`, { headers: headers() });
    return resp.json();
  },

  async createNews(item: Omit<NewsItem, "id" | "publishedAt" | "status" | "isRead">): Promise<NewsItem> {
    const resp = await fetch(`${API_BASE}/news`, { method: "POST", headers: headers(), body: JSON.stringify(item) });
    return resp.json();
  },

  async approveNews(id: string): Promise<NewsItem> {
    const resp = await fetch(`${API_BASE}/news/${id}/approve`, { method: "POST", headers: headers() });
    return resp.json();
  },

  async rejectNews(id: string, reason: string): Promise<NewsItem> {
    const resp = await fetch(`${API_BASE}/news/${id}/reject`, { method: "POST", headers: headers(), body: JSON.stringify({ reason }) });
    return resp.json();
  },

  async editNews(id: string, data: { title: string; summary: string; content: string }): Promise<NewsItem> {
    const resp = await fetch(`${API_BASE}/news/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify(data) });
    return resp.json();
  },

  async deleteNews(id: string): Promise<void> {
    await fetch(`${API_BASE}/news/${id}`, { method: "DELETE", headers: headers() });
  },

  async markNewsRead(id: string): Promise<void> {
    await fetch(`${API_BASE}/news/${id}/read`, { method: "POST", headers: headers() });
  },

  async markAllNewsRead(): Promise<void> {
    await fetch(`${API_BASE}/news/read-all`, { method: "POST", headers: headers() });
  },

  async getMissions(): Promise<Mission[]> {
    const resp = await fetch(`${API_BASE}/missions`, { headers: headers() });
    return resp.json();
  },

  async createMission(m: {
    title: string;
    location: string;
    description?: string;
    priority?: MissionPriority;
    patientInfo?: string;
    scheduledFor?: string;
  }): Promise<Mission> {
    const resp = await fetch(`${API_BASE}/missions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(m),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error ?? "Einsatz konnte nicht erstellt werden");
    return data as Mission;
  },

  async acceptMission(id: string): Promise<Mission> {
    const resp = await fetch(`${API_BASE}/missions/${id}/accept`, { method: "POST", headers: headers() });
    return resp.json();
  },

  async rejectMission(id: string): Promise<Mission> {
    const resp = await fetch(`${API_BASE}/missions/${id}/reject`, { method: "POST", headers: headers() });
    return resp.json();
  },

    async dismissMission(id: string): Promise<void> {
    const resp = await fetch(`${API_BASE}/missions/${id}/dismiss`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Konnte Einsatz nicht ausblenden");
    }
  },

  async getLOARequests(userId?: string): Promise<LOARequest[]> {
    const resp = await fetch(`${API_BASE}/loa`, { headers: headers() });
    return resp.json();
  },

  async createLOA(req: Omit<LOARequest, "id" | "createdAt" | "status">): Promise<LOARequest> {
    const resp = await fetch(`${API_BASE}/loa`, { method: "POST", headers: headers(), body: JSON.stringify(req) });
    return resp.json();
  },

  async approveLOA(id: string, note?: string): Promise<LOARequest> {
    const resp = await fetch(`${API_BASE}/loa/${id}/approve`, { method: "POST", headers: headers(), body: JSON.stringify({ note }) });
    return resp.json();
  },

  async rejectLOA(id: string, reason: string): Promise<LOARequest> {
    const resp = await fetch(`${API_BASE}/loa/${id}/reject`, { method: "POST", headers: headers(), body: JSON.stringify({ reason }) });
    return resp.json();
  },

  async appealLOA(id: string, appealNote: string): Promise<LOARequest> {
    const resp = await fetch(`${API_BASE}/loa/${id}/appeal`, { method: "POST", headers: headers(), body: JSON.stringify({ appealNote }) });
    return resp.json();
  },

  async getNotifications(): Promise<NotificationItem[]> {
    const resp = await fetch(`${API_BASE}/notifications`, { headers: headers() });
    return resp.json();
  },

  async markAllNotificationsRead(): Promise<void> {
    await fetch(`${API_BASE}/notifications/read-all`, { method: "POST", headers: headers() });
  },

  async getDutyStatus(): Promise<DutyStatus> {
    const resp = await fetch(`${API_BASE}/status`, { headers: headers() });
    return resp.json();
  },

  async updateDutyStatus(status: DutyStatus["status"]): Promise<DutyStatus> {
    const resp = await fetch(`${API_BASE}/status`, { method: "POST", headers: headers(), body: JSON.stringify({ status }) });
    return resp.json();
  },

  async getAllUsers(): Promise<User[]> {
    const resp = await fetch(`${API_BASE}/users`, { headers: headers() });
    return resp.json();
  },

  async getOnDutyUsers(): Promise<User[]> {
    const resp = await fetch(`${API_BASE}/status/on-duty`, { headers: headers() });
    return resp.json();
  },

  async getMyActivity(): Promise<ActivityLog[]> {
    const resp = await fetch(`${API_BASE}/activity/my`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Aktivitäten konnten nicht geladen werden");
    }
    return resp.json();
  },

  async getUserActivity(userId: string): Promise<ActivityLog[]> {
    const resp = await fetch(`${API_BASE}/activity/user/${userId}`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Benutzeraktivitäten konnten nicht geladen werden");
    }
    return resp.json();
  },

  async getActivityUsers(): Promise<ActivitySummary[]> {
    const resp = await fetch(`${API_BASE}/activity/users`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Benutzerübersicht konnte nicht geladen werden");
    }
    return resp.json();
  },
};

export default ApiService;
