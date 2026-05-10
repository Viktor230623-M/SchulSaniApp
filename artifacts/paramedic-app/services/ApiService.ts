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
  async login(credentials: { username: string; password: string }, rememberMe?: boolean): Promise<{ user: User; isTealUnlocked: boolean; token: string }> {
    const resp = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ username: credentials.username.trim(), password: credentials.password, rememberMe }),
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
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Nachrichten konnten nicht geladen werden");
    }
    return resp.json();
  },

  async createNews(item: Omit<NewsItem, "id" | "publishedAt" | "status" | "isRead">): Promise<NewsItem> {
    const resp = await fetch(`${API_BASE}/news`, { method: "POST", headers: headers(), body: JSON.stringify(item) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Nachricht konnte nicht erstellt werden");
    }
    return resp.json();
  },

  async approveNews(id: string): Promise<NewsItem> {
    const resp = await fetch(`${API_BASE}/news/${id}/approve`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Nachricht konnte nicht genehmigt werden");
    }
    return resp.json();
  },

  async rejectNews(id: string, reason: string): Promise<NewsItem> {
    const resp = await fetch(`${API_BASE}/news/${id}/reject`, { method: "POST", headers: headers(), body: JSON.stringify({ reason }) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Nachricht konnte nicht abgelehnt werden");
    }
    return resp.json();
  },

  async editNews(id: string, data: { title: string; summary: string; content: string }): Promise<NewsItem> {
    const resp = await fetch(`${API_BASE}/news/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify(data) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Nachricht konnte nicht bearbeitet werden");
    }
    return resp.json();
  },

  async deleteNews(id: string): Promise<void> {
    const resp = await fetch(`${API_BASE}/news/${id}`, { method: "DELETE", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Nachricht konnte nicht gelöscht werden");
    }
  },

  async markNewsRead(id: string): Promise<void> {
    const resp = await fetch(`${API_BASE}/news/${id}/read`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Nachricht konnte nicht als gelesen markiert werden");
    }
  },

  async markAllNewsRead(): Promise<void> {
    const resp = await fetch(`${API_BASE}/news/read-all`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Nachrichten konnten nicht als gelesen markiert werden");
    }
  },

  async getMissions(): Promise<Mission[]> {
    const resp = await fetch(`${API_BASE}/missions`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Einsätze konnten nicht geladen werden");
    }
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
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Einsatz konnte nicht angenommen werden");
    }
    return resp.json();
  },

  async rejectMission(id: string): Promise<Mission> {
    const resp = await fetch(`${API_BASE}/missions/${id}/reject`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Einsatz konnte nicht abgelehnt werden");
    }
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
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Abwesenheitsanträge konnten nicht geladen werden");
    }
    return resp.json();
  },

  async createLOA(req: Omit<LOARequest, "id" | "createdAt" | "status">): Promise<LOARequest> {
    const resp = await fetch(`${API_BASE}/loa`, { method: "POST", headers: headers(), body: JSON.stringify(req) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Abwesenheitsantrag konnte nicht erstellt werden");
    }
    return resp.json();
  },

  async approveLOA(id: string, note?: string): Promise<LOARequest> {
    const resp = await fetch(`${API_BASE}/loa/${id}/approve`, { method: "POST", headers: headers(), body: JSON.stringify({ note }) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Abwesenheitsantrag konnte nicht genehmigt werden");
    }
    return resp.json();
  },

  async rejectLOA(id: string, reason: string): Promise<LOARequest> {
    const resp = await fetch(`${API_BASE}/loa/${id}/reject`, { method: "POST", headers: headers(), body: JSON.stringify({ reason }) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Abwesenheitsantrag konnte nicht abgelehnt werden");
    }
    return resp.json();
  },

  async appealLOA(id: string, appealNote: string): Promise<LOARequest> {
    const resp = await fetch(`${API_BASE}/loa/${id}/appeal`, { method: "POST", headers: headers(), body: JSON.stringify({ appealNote }) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Abwesenheitsantrag konnte nicht eingelegt werden");
    }
    return resp.json();
  },

  async getNotifications(): Promise<NotificationItem[]> {
    const resp = await fetch(`${API_BASE}/notifications`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Benachrichtigungen konnten nicht geladen werden");
    }
    return resp.json();
  },

  async markAllNotificationsRead(): Promise<void> {
    const resp = await fetch(`${API_BASE}/notifications/read-all`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Benachrichtigungen konnten nicht als gelesen markiert werden");
    }
  },

  async getDutyStatus(): Promise<DutyStatus> {
    const resp = await fetch(`${API_BASE}/status`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Dienststatus konnte nicht geladen werden");
    }
    return resp.json();
  },

  async updateDutyStatus(status: DutyStatus["status"]): Promise<DutyStatus> {
    const resp = await fetch(`${API_BASE}/status`, { method: "POST", headers: headers(), body: JSON.stringify({ status }) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Dienststatus konnte nicht aktualisiert werden");
    }
    return resp.json();
  },

  async getAllUsers(): Promise<User[]> {
    const resp = await fetch(`${API_BASE}/users`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Benutzer konnten nicht geladen werden");
    }
    return resp.json();
  },

  async getOnDutyUsers(): Promise<User[]> {
    const resp = await fetch(`${API_BASE}/status/on-duty`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Benutzer im Dienst konnten nicht geladen werden");
    }
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

  async updateProfile(userId: string, data: { avatarUrl?: string }): Promise<User> {
    const resp = await fetch(`${API_BASE}/users/${userId}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(data),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error ?? "Profil konnte nicht aktualisiert werden");
    }
    return resp.json();
  },
};

export default ApiService;
