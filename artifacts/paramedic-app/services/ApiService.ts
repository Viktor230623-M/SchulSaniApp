import type {
  ActivityLog,
  ActivitySummary,
  DutyStatus,
  IncidentReport,
  LOARequest,
  Mission,
  MissionActivityLog,
  MissionPriority,
  NewsItem,
  NotificationItem,
  RoleInfo,
  User,
  SqlPreset,
  DbConsoleResult,
  PermissionDef,
} from "@/models";

const API_BASE = `https://${process.env["EXPO_PUBLIC_DOMAIN"]}/api`;

/** Anmeldeweg dieser Installation, wie ihn GET /auth/providers liefert. */
export interface AuthProviderInfo {
  key: string;
  displayName: string;
  type: "iserv-form" | "oidc-redirect" | "local";
}

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  // App und API liegen beide unter EXPO_PUBLIC_DOMAIN, weshalb fetch das Cookie
  // schon im Standardmodus "same-origin" mitschickt. Explizit gesetzt, damit ein
  // spaeterer Umzug der API auf eine andere Domain nicht still die Sitzung bricht.
  const resp = await fetch(url, { ...init, credentials: "include" });
  if (resp.status === 401) {
    const { useAppStore } = await import("@/store/useAppStore");
    useAppStore.getState().logout();
  }
  return resp;
}

function headers() {
  return {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

const ApiService = {
  async login(credentials: { username: string; password: string; providerKey: string }, rememberMe?: boolean): Promise<{ user: User; isTealUnlocked: boolean; token: string }> {
    const resp = await apiFetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ providerKey: credentials.providerKey, username: credentials.username.trim(), password: credentials.password, rememberMe }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error ?? "Anmeldung fehlgeschlagen");
    if (data.token) setAuthToken(data.token);
    const user: User = { ...data.user, permissions: data.permissions ?? [] };
    return { user, isTealUnlocked: data.isTealUnlocked, token: data.token };
  },

  /**
   * Holt aus dem httpOnly-Sitzungscookie ein frisches Bearer-Token.
   *
   * Bewusst `fetch` statt `apiFetch`: Letzteres loest bei 401 ein `logout()` aus.
   * Beim Start ist ein 401 aber der Normalfall (niemand angemeldet) und darf
   * keinen Abmeldevorgang anstossen.
   */
  async restoreSession(): Promise<{ user: User; isTealUnlocked: boolean; token: string } | null> {
    // Zeitlimit von 8 Sekunden: nicht gegen ein langsames Netz, sondern gegen
    // einen Aufruf, der weder antwortet noch scheitert. Ohne Limit bleibt
    // authStatus in _layout.tsx auf "loading" haengen und die App dauerhaft weiss.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const resp = await fetch(`${API_BASE}/auth/session`, {
        method: "GET",
        headers: { "ngrok-skip-browser-warning": "true" },
        credentials: "include",
        signal: controller.signal,
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data.token) return null;
      setAuthToken(data.token);
      const user: User = { ...data.user, permissions: data.permissions ?? [] };
      return { user, isTealUnlocked: data.isTealUnlocked, token: data.token };
    } catch {
      // Netzwerkfehler oder Abbruch durch das Zeitlimit: als "nicht angemeldet"
      // behandeln, nicht als Absturz.
      return null;
    } finally {
      clearTimeout(timeout);
    }
  },

  /**
   * Anmeldewege dieser Installation. Oeffentlicher Endpunkt, kein Cookie
   * noetig. Wirft bei Netzfehler oder Zeitlimit -- der Aufrufer entscheidet,
   * wie der Anmeldebildschirm bei einem Ausfall dieses Abrufs aussieht.
   */
  async getAuthProviders(): Promise<AuthProviderInfo[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const resp = await fetch(`${API_BASE}/auth/providers`, {
        headers: { "ngrok-skip-browser-warning": "true" },
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error("Anmeldewege konnten nicht geladen werden");
      const data = await resp.json();
      return Array.isArray(data.providers) ? data.providers : [];
    } finally {
      clearTimeout(timeout);
    }
  },

  /** URL des Weiterleitungsstarts eines Anmeldewegs (GET /auth/:provider/start). */
  getProviderStartUrl(providerKey: string): string {
    return `${API_BASE}/auth/${encodeURIComponent(providerKey)}/start`;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const resp = await fetch(`${API_BASE}/auth/password/change`, {
      method: "POST",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Passwort konnte nicht geaendert werden");
  },

  /** Setzt einmalig den bestaetigten Namen fuer das eigene Konto (PATCH /auth/profile). */
  async confirmProfile(firstName: string, lastName: string): Promise<User> {
    const resp = await apiFetch(`${API_BASE}/auth/profile`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ firstName, lastName }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error ?? "Bestaetigung fehlgeschlagen");
    return { ...data.user, permissions: data.permissions ?? [] };
  },

  async logout(): Promise<void> {
    // Serverseitig widerrufen, damit ein kopiertes Cookie nach dem Abmelden
    // wertlos ist. Fehler werden geschluckt: lokal abmelden muss immer gelingen.
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: headers(),
        credentials: "include",
      });
    } catch {
      // absichtlich ignoriert
    }
    setAuthToken(null);
  },

  async getNews(): Promise<NewsItem[]> {
    const resp = await apiFetch(`${API_BASE}/news`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Nachrichten konnten nicht geladen werden");
    }
    return resp.json();
  },

  async createNews(item: Omit<NewsItem, "id" | "publishedAt" | "status" | "isRead">): Promise<NewsItem> {
    const resp = await apiFetch(`${API_BASE}/news`, { method: "POST", headers: headers(), body: JSON.stringify(item) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Nachricht konnte nicht erstellt werden");
    }
    return resp.json();
  },

  async approveNews(id: string): Promise<NewsItem> {
    const resp = await apiFetch(`${API_BASE}/news/${id}/approve`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Nachricht konnte nicht genehmigt werden");
    }
    return resp.json();
  },

  async rejectNews(id: string, reason: string): Promise<NewsItem> {
    const resp = await apiFetch(`${API_BASE}/news/${id}/reject`, { method: "POST", headers: headers(), body: JSON.stringify({ reason }) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Nachricht konnte nicht abgelehnt werden");
    }
    return resp.json();
  },

  async editNews(id: string, data: { title: string; summary: string; content: string }): Promise<NewsItem> {
    const resp = await apiFetch(`${API_BASE}/news/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify(data) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Nachricht konnte nicht bearbeitet werden");
    }
    return resp.json();
  },

  async deleteNews(id: string): Promise<void> {
    const resp = await apiFetch(`${API_BASE}/news/${id}`, { method: "DELETE", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Nachricht konnte nicht gelöscht werden");
    }
  },

  async markNewsRead(id: string): Promise<void> {
    const resp = await apiFetch(`${API_BASE}/news/${id}/read`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Nachricht konnte nicht als gelesen markiert werden");
    }
  },

  async markAllNewsRead(): Promise<void> {
    const resp = await apiFetch(`${API_BASE}/news/read-all`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Nachrichten konnten nicht als gelesen markiert werden");
    }
  },

  async getMissions(): Promise<Mission[]> {
    const resp = await apiFetch(`${API_BASE}/missions`, { headers: headers() });
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
    const resp = await apiFetch(`${API_BASE}/missions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(m),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error ?? "Einsatz konnte nicht erstellt werden");
    return data as Mission;
  },

  async acceptMission(id: string): Promise<Mission> {
    const resp = await apiFetch(`${API_BASE}/missions/${id}/accept`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Einsatz konnte nicht angenommen werden");
    }
    return resp.json();
  },

  async rejectMission(id: string): Promise<Mission> {
    const resp = await apiFetch(`${API_BASE}/missions/${id}/reject`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Einsatz konnte nicht abgelehnt werden");
    }
    return resp.json();
  },

    async dismissMission(id: string): Promise<void> {
    const resp = await apiFetch(`${API_BASE}/missions/${id}/dismiss`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Konnte Einsatz nicht ausblenden");
    }
  },

  async getLOARequests(userId?: string): Promise<LOARequest[]> {
    const resp = await apiFetch(`${API_BASE}/loa`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Abwesenheitsanträge konnten nicht geladen werden");
    }
    return resp.json();
  },

  async createLOA(req: Omit<LOARequest, "id" | "createdAt" | "status">): Promise<LOARequest> {
    const resp = await apiFetch(`${API_BASE}/loa`, { method: "POST", headers: headers(), body: JSON.stringify(req) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Abwesenheitsantrag konnte nicht erstellt werden");
    }
    return resp.json();
  },

  async approveLOA(id: string, note?: string): Promise<LOARequest> {
    const resp = await apiFetch(`${API_BASE}/loa/${id}/approve`, { method: "POST", headers: headers(), body: JSON.stringify({ note }) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Abwesenheitsantrag konnte nicht genehmigt werden");
    }
    return resp.json();
  },

  async rejectLOA(id: string, reason: string): Promise<LOARequest> {
    const resp = await apiFetch(`${API_BASE}/loa/${id}/reject`, { method: "POST", headers: headers(), body: JSON.stringify({ reason }) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Abwesenheitsantrag konnte nicht abgelehnt werden");
    }
    return resp.json();
  },

  async appealLOA(id: string, appealNote: string): Promise<LOARequest> {
    const resp = await apiFetch(`${API_BASE}/loa/${id}/appeal`, { method: "POST", headers: headers(), body: JSON.stringify({ appealNote }) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Abwesenheitsantrag konnte nicht eingelegt werden");
    }
    return resp.json();
  },

  async getNotifications(): Promise<NotificationItem[]> {
    const resp = await apiFetch(`${API_BASE}/notifications`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Benachrichtigungen konnten nicht geladen werden");
    }
    return resp.json();
  },

  async markAllNotificationsRead(): Promise<void> {
    const resp = await apiFetch(`${API_BASE}/notifications/read-all`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Benachrichtigungen konnten nicht als gelesen markiert werden");
    }
  },

  async getDutyStatus(): Promise<DutyStatus> {
    const resp = await apiFetch(`${API_BASE}/status`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Dienststatus konnte nicht geladen werden");
    }
    return resp.json();
  },

  async updateDutyStatus(status: DutyStatus["status"]): Promise<DutyStatus> {
    const resp = await apiFetch(`${API_BASE}/status`, { method: "POST", headers: headers(), body: JSON.stringify({ status }) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Dienststatus konnte nicht aktualisiert werden");
    }
    return resp.json();
  },

  async getAllUsers(): Promise<User[]> {
    const resp = await apiFetch(`${API_BASE}/users`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Benutzer konnten nicht geladen werden");
    }
    return resp.json();
  },

  async getRoles(): Promise<RoleInfo[]> {
    const resp = await apiFetch(`${API_BASE}/roles`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Rollen konnten nicht geladen werden");
    }
    return resp.json();
  },

  async getPermissionCatalog(): Promise<PermissionDef[]> {
    const resp = await apiFetch(`${API_BASE}/roles/permissions`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Berechtigungen konnten nicht geladen werden");
    }
    return resp.json();
  },

  async getRolePermissions(roleId: string): Promise<string[]> {
    const resp = await apiFetch(`${API_BASE}/roles/${roleId}/permissions`, { headers: headers() });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Berechtigungen der Rolle konnten nicht geladen werden");
    return data.permissions ?? [];
  },

  async setRolePermissions(roleId: string, permissions: string[]): Promise<string[]> {
    const resp = await apiFetch(`${API_BASE}/roles/${roleId}/permissions`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ permissions }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Berechtigungen konnten nicht gespeichert werden");
    return data.permissions ?? [];
  },

  async createRole(input: { key: string; displayName: string; displayNameEn?: string; color?: string }): Promise<{ id: string; key: string }> {
    const resp = await apiFetch(`${API_BASE}/roles`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(input),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Rolle konnte nicht angelegt werden");
    return data;
  },

  async updateRole(id: string, input: { displayName?: string; displayNameEn?: string | null; color?: string | null }): Promise<{ id: string }> {
    const resp = await apiFetch(`${API_BASE}/roles/${id}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(input),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Rolle konnte nicht geaendert werden");
    return data;
  },

  async deleteRole(id: string): Promise<void> {
    const resp = await apiFetch(`${API_BASE}/roles/${id}`, { method: "DELETE", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Rolle konnte nicht geloescht werden");
    }
  },

  async getOnDutyUsers(): Promise<User[]> {
    const resp = await apiFetch(`${API_BASE}/status/on-duty`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Benutzer im Dienst konnten nicht geladen werden");
    }
    return resp.json();
  },

  async getMyActivity(): Promise<ActivityLog[]> {
    const resp = await apiFetch(`${API_BASE}/activity/my`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Aktivitäten konnten nicht geladen werden");
    }
    return resp.json();
  },

  async getUserActivity(userId: string): Promise<ActivityLog[]> {
    const resp = await apiFetch(`${API_BASE}/activity/user/${userId}`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Benutzeraktivitäten konnten nicht geladen werden");
    }
    return resp.json();
  },

  async getActivityUsers(): Promise<ActivitySummary[]> {
    const resp = await apiFetch(`${API_BASE}/activity/users`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Benutzerübersicht konnte nicht geladen werden");
    }
    return resp.json();
  },

  async getPendingUsers(): Promise<User[]> {
    const resp = await apiFetch(`${API_BASE}/users/pending`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Ausstehende Benutzer konnten nicht geladen werden");
    }
    return resp.json();
  },

  async approveUser(id: string, role: string): Promise<User> {
    const resp = await apiFetch(`${API_BASE}/users/${id}/approve`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ role }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Benutzer konnte nicht freigeschaltet werden");
    }
    return resp.json();
  },

  async updateUserRole(id: string, role: string): Promise<User> {
    const resp = await apiFetch(`${API_BASE}/users/${id}/role`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ role }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Rolle konnte nicht geändert werden");
    }
    return resp.json();
  },

  /** Korrigiert einen falsch eingegebenen Namen fremder Konten (PATCH /users/:id/profile, users.correct_profile). */
  async correctUserProfile(id: string, firstName: string, lastName: string): Promise<User> {
    const resp = await apiFetch(`${API_BASE}/users/${id}/profile`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ firstName, lastName }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Name konnte nicht korrigiert werden");
    return data;
  },

  async deleteUser(id: string): Promise<void> {
    const resp = await apiFetch(`${API_BASE}/users/${id}`, { method: "DELETE", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Benutzer konnte nicht gelöscht werden");
    }
  },

  async updateProfile(userId: string, data: { avatarUrl?: string }): Promise<User> {
    const resp = await apiFetch(`${API_BASE}/users/${userId}`, {
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

  async registerDeviceToken(token: string, platform: "ios" | "android" | "web", deviceId?: string): Promise<void> {
    const resp = await apiFetch(`${API_BASE}/notifications/register-device`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ token, platform, deviceId }),
    });
    if (!resp.ok) {
      console.error("Failed to register device token");
      console.warn("Fehler", "Push-Benachrichtigungen konnten nicht aktiviert werden.");
    }
  },

  async unregisterDeviceToken(token: string): Promise<void> {
    const resp = await apiFetch(`${API_BASE}/notifications/unregister-device`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ token }),
    });
    if (!resp.ok) {
      console.error("Failed to unregister device token");
      console.warn("Fehler", "Push-Benachrichtigungen konnten nicht deaktiviert werden.");
    }
  },

  async getIncidentReports(params?: { missionId?: string; mine?: boolean }): Promise<IncidentReport[]> {
    const query = new URLSearchParams();
    if (params?.missionId) query.set("missionId", params.missionId);
    if (params?.mine) query.set("mine", "true");
    const qs = query.toString() ? `?${query}` : "";
    const resp = await apiFetch(`${API_BASE}/incident-reports${qs}`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Protokolle konnten nicht geladen werden");
    }
    return resp.json();
  },

  async getIncidentReport(id: string): Promise<IncidentReport> {
    const resp = await apiFetch(`${API_BASE}/incident-reports/${id}`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Protokoll konnte nicht geladen werden");
    }
    return resp.json();
  },

  async createIncidentReport(data: Partial<IncidentReport>): Promise<IncidentReport> {
    const resp = await apiFetch(`${API_BASE}/incident-reports`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(data),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error ?? "Protokoll konnte nicht erstellt werden");
    }
    return resp.json();
  },

  async updateIncidentReport(id: string, data: Partial<IncidentReport>): Promise<IncidentReport> {
    const resp = await apiFetch(`${API_BASE}/incident-reports/${id}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(data),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error ?? "Protokoll konnte nicht aktualisiert werden");
    }
    return resp.json();
  },

  async submitIncidentReport(id: string): Promise<IncidentReport> {
    const resp = await apiFetch(`${API_BASE}/incident-reports/${id}/submit`, {
      method: "POST",
      headers: headers(),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error ?? "Protokoll konnte nicht eingereicht werden");
    }
    return resp.json();
  },

  async addReportAddendum(id: string, text: string): Promise<IncidentReport> {
    const resp = await apiFetch(`${API_BASE}/incident-reports/${id}/addendum`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ text }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error ?? "Nachtrag konnte nicht hinzugefügt werden");
    }
    return resp.json();
  },

  /**
   * URL des PDF-Exports. Bewusst ohne Token: Der Endpunkt hat den
   * Query-Parameter nie ausgewertet, und ein Token in der URL landet in
   * Server-Logs und im Verlauf des Browsers.
   */
  getReportPdfUrl(id: string, lang: "de" | "en" = "de"): string {
    return `${API_BASE}/incident-reports/${id}/pdf?lang=${lang}`;
  },

  /** Kopfzeilen fuer Abrufe ausserhalb von `headers()`, das faelschlich JSON deklariert. */
  getAuthHeaders(): Record<string, string> {
    return {
      "ngrok-skip-browser-warning": "true",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };
  },

  async fetchReportPdfBlob(id: string, lang: "de" | "en" = "de"): Promise<Blob> {
    const resp = await apiFetch(this.getReportPdfUrl(id, lang), {
      headers: this.getAuthHeaders(),
    });
    if (!resp.ok) throw new Error("PDF konnte nicht geladen werden");
    return resp.blob();
  },
  // --- Owner-only database console ---

  async getDbPresets(): Promise<{ presets: SqlPreset[] }> {
    const resp = await apiFetch(`${API_BASE}/db-console/presets`, { headers: headers() });
    if (!resp.ok) throw new Error("Presets konnten nicht geladen werden");
    return resp.json();
  },

  async getDbTables(): Promise<{ tables: { table: string; approx_rows: number }[] }> {
    const resp = await apiFetch(`${API_BASE}/db-console/tables`, { headers: headers() });
    if (!resp.ok) throw new Error("Tabellen konnten nicht geladen werden");
    return resp.json();
  },

  async runDbStatement(input: {
    statement: string;
    presetKey?: string | null;
    confirm?: boolean;
  }): Promise<DbConsoleResult> {
    const resp = await apiFetch(`${API_BASE}/db-console/execute`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Ausführung fehlgeschlagen");
    return data;
  },
};

export default ApiService;
