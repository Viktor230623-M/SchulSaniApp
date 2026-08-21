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
  Shift,
  User,
  PermissionDef,
} from "@/models";
import * as keyManager from "./crypto/keyManager";
import * as secureStore from "./crypto/secureStore";
import { clearIncidentDraftsForUser } from "./incidentDraftStore";
import { fromBase64, toBase64 } from "./crypto/encoding";

const API_BASE = `https://${process.env["EXPO_PUBLIC_DOMAIN"]}/api`;

/** Anmeldeweg dieser Installation, wie ihn GET /auth/providers liefert. */
export interface AuthProviderInfo {
  key: string;
  displayName: string;
  type: "local" | "oidc-redirect";
}

/** Antwort von GET /auth/providers: Wege plus Flag, ob ein Schul-Code noetig ist. */
export interface AuthProvidersResult {
  providers: AuthProviderInfo[];
  joinCodeRequired: boolean;
}

/** Schule im Cloud-Betrieb, wie sie GET /auth/schools liefert. */
export interface PublicSchool {
  id: string;
  name: string;
  joinCodeRequired: boolean;
}

export interface SchoolsResult {
  multiTenant: boolean;
  schools: PublicSchool[];
}

export interface AuthIdentityInfo {
  id: string;
  providerKey: string;
  displayName: string;
  type: AuthProviderInfo["type"] | "unknown";
  createdAt: string;
  lastUsedAt: string | null;
}

export type PrivacyRequestType = "access" | "rectification" | "erasure" | "restriction" | "portability" | "objection";
export type PrivacyRequestStatus = "pending" | "in_review" | "fulfilled" | "rejected";

export interface PrivacyRequest {
  id: string;
  schoolId: string;
  requesterId: string;
  requesterEmail: string | null;
  requestType: PrivacyRequestType;
  subjectName: string;
  subjectRelation: string | null;
  status: PrivacyRequestStatus;
  handledBy: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

/** Die Sitzung ist da, aber der Entschluesselungs-Key fehlt noch (Reload, OIDC). */
export class UnlockRequiredError extends Error {
  constructor() {
    super("Verschluesselung ist gesperrt");
    this.name = "UnlockRequiredError";
  }
}

// --- Ende-zu-Ende-Verschluesselung -----------------------------------------
// Der Server sieht nur Chiffrat. Der schulweite Datenschluessel (DEK) wird
// hier mit dem eigenen privaten Schluessel geoeffnet und pro Version gecacht;
// die Inhalte werden lokal ver-/entschluesselt (secretbox).

let dekCache = new Map<number, Uint8Array>();

export function clearDekCache(): void {
  dekCache = new Map();
}

async function setStoreCryptoLocked(locked: boolean): Promise<void> {
  const { useAppStore } = await import("@/store/useAppStore");
  useAppStore.getState().setCryptoLocked(locked);
}

/**
 * Gleicht den Entsperr-Zustand mit dem Server ab. Die App verlangt die
 * Entsperrung, sobald der KEK dieser Sitzung fehlt -- auch wenn noch gar kein
 * Schluesselpaar existiert (frisches OIDC-Konto): Dann zeigt der Entsperr-Screen
 * den Einrichtungsmodus und erzeugt das Paar. Nur eine brauchbare Serverantwort
 * entscheidet; bei Netzfehler bleibt der Zustand unveraendert, statt den Nutzer
 * faelschlich zu sperren.
 */
export async function syncCryptoLockState(): Promise<void> {
  try {
    const resp = await apiFetch(`${API_BASE}/crypto/key`, { headers: headers() });
    const data = await resp.json().catch(() => ({}));
    const known = typeof data.hasKeypair === "boolean";
    await setStoreCryptoLocked(known && !keyManager.isUnlocked());
  } catch {
    // Netzfehler sperrt nicht: Ein erfolgreicher Login soll nicht wegen eines
    // fehlgeschlagenen Krypto-Abrufs als Fehler enden.
  }
}

interface DekWrap {
  dekVersion: number;
  wrappedDek: string;
}

async function myDekWraps(): Promise<DekWrap[]> {
  const resp = await apiFetch(`${API_BASE}/crypto/dek`, { headers: headers() });
  const data = await resp.json().catch(() => ({}));
  return Array.isArray(data.wraps) ? data.wraps : [];
}

async function getDek(version?: number): Promise<{ dek: Uint8Array; dekVersion: number }> {
  const kp = keyManager.getKeypair();
  if (!kp) throw new UnlockRequiredError();
  const wraps = await myDekWraps();
  const wrap = version ? wraps.find((w) => w.dekVersion === version) : wraps[0];
  if (!wrap) {
    throw new Error("Kein Datenschluessel fuer dieses Konto. Ein Verwalter muss dir den Zugriff freigeben.");
  }
  const cached = dekCache.get(wrap.dekVersion);
  if (cached) return { dek: cached, dekVersion: wrap.dekVersion };
  const dek = await keyManager.unwrapDek(wrap.wrappedDek, kp);
  dekCache.set(wrap.dekVersion, dek);
  return { dek, dekVersion: wrap.dekVersion };
}

// Felder, die verschluesselt werden -- der komplette Gesundheitsinhalt.
const ENCRYPTED_FIELDS = [
  "title", "patientType", "patientFirstName", "patientLastName", "patientClass",
  "patientAge", "patientSex", "patientBirthDate", "teacherName",
  "emergencyContactName", "emergencyContactPhone", "category",
  "description", "injurySites", "measures", "treatmentNotes", "pulseBpm", "spo2",
  "respRate", "bloodPressure", "consciousnessAvpu", "painScore", "outcome",
  "outcomeNotes", "witnesses", "addenda",
  "breathing", "skinColor", "pulseRegular", "orientation", "pupilsLeft",
  "pupilsRight", "pupilReaction", "complaintHistory", "medications",
  "allergies", "recheckTime2", "recheckPulse2", "recheckRegular2",
  "recheckTime3", "recheckPulse3", "recheckRegular3", "progressNotes",
  "leadingSymptom", "handoverProperty", "accompaniedBy", "signatures",
] as const;

type EncryptedReportRow = Record<string, unknown> & {
  contentEncrypted?: string | null;
  contentKeyVersion?: number | null;
  responderIdsJson?: unknown;
  missionTitle?: string | null;
};

/**
 * Loest den Chiffrat-Teil eines Protokolls auf und mischt ihn in das Objekt.
 * Im strikten Modus (Export) schlaegt eine nicht entschluesselbare Zeile fehl,
 * statt still nur Metadaten zu liefern -- sonst koennte ein Export mit leerem
 * PDF bestaetigt und die Protokolle geloescht werden.
 */
async function decryptReport<T extends EncryptedReportRow>(row: T, strict = false): Promise<T> {
  const meta = { ...row, responderIds: Array.isArray(row.responderIdsJson) ? row.responderIdsJson : [] } as T;
  if (!row.contentEncrypted) return meta;
  try {
    const { dek } = await getDek(row.contentKeyVersion ?? undefined);
    const fields = await keyManager.decryptJson(row.contentEncrypted, dek);
    return { ...meta, ...fields } as T;
  } catch (err) {
    if (err instanceof UnlockRequiredError) throw err;
    if (strict) throw new Error("Protokoll konnte nicht entschluesselt werden.");
    // Ohne DEK-Zugriff nur Metadaten; die Protokoll-Liste bleibt bedienbar.
    return meta;
  }
}

/** Trennt Metadaten vom Inhalt und verschluesselt den Inhalt lokal. */
async function encryptReportPayload(payload: Record<string, unknown>): Promise<{
  contentEncrypted: string;
  contentKeyVersion: number;
  metadata: Record<string, unknown>;
}> {
  const content: Record<string, unknown> = {};
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if ((ENCRYPTED_FIELDS as readonly string[]).includes(key)) content[key] = value;
    else metadata[key] = value;
  }
  const { dek, dekVersion } = await getDek();
  const contentEncrypted = await keyManager.encryptJson(content, dek);
  return { contentEncrypted, contentKeyVersion: dekVersion, metadata };
}

/** Fehler mit Zusatzdaten, etwa dem Handoff des Schul-Zugangscode-Vorgangs. */
export class AuthError extends Error {
  readonly handoff?: string;
  constructor(message: string, handoff?: string) {
    super(message);
    this.name = "AuthError";
    this.handoff = handoff;
  }
}

// Standard-Timeout fuer alle API-Aufrufe. Ohne Zeitlimit bleibt eine
// haengende Anfrage (Treppenhaus, Funkloch) ein endloser Lade-Spinner.
const FETCH_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  // Uebernommenes Signal (z. B. Restore-Session) muss trotzdem den eigenen
  // Abbruch ausloesen — AbortSignal.any gibt es in Hermes nicht sicher.
  const fremdes = init?.signal;
  const onAbort = () => controller.abort();
  fremdes?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    fremdes?.removeEventListener("abort", onAbort);
    clearTimeout(timeout);
  }
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  // App und API liegen beide unter EXPO_PUBLIC_DOMAIN, weshalb fetch das Cookie
  // schon im Standardmodus "same-origin" mitschickt. Explizit gesetzt, damit ein
  // spaeterer Umzug der API auf eine andere Domain nicht still die Sitzung bricht.
  // cache: no-store, damit der Browser nie eine 304-Antwort ohne Body liefert,
  // die resp.json() nicht mehr lesen kann.
  const resp = await fetchWithTimeout(url, { ...init, credentials: "include", cache: "no-store" });
  if (resp.status === 401) {
    const { useAppStore } = await import("@/store/useAppStore");
    useAppStore.getState().logout();
  }
  return resp;
}

function headers() {
  return {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

interface AuthParams {
  saltLogin: string;
  saltEnc: string;
  hasKeypair: boolean;
}

async function fetchAuthParams(providerKey: string, username: string, schoolId?: string): Promise<AuthParams> {
  const params = new URLSearchParams({ providerKey, username });
  if (schoolId) params.set("schoolId", schoolId);
  const url = `${API_BASE}/auth/params?${params}`;
  const resp = await fetchWithTimeout(url, { cache: "no-store" });
  if (!resp.ok) throw new Error("Anmeldewege konnten nicht geladen werden");
  return resp.json();
}

async function fetchAuthParamsForCurrentUser(): Promise<string | null> {
  const { useAppStore } = await import("@/store/useAppStore");
  const user = useAppStore.getState().user;
  const identity = user?.email || user?.id || "";
  if (!identity) return null;
  const params = await fetchAuthParams("local", identity, user?.schoolId ?? undefined);
  return params.saltLogin;
}

/**
 * Entsperrt die lokale Verschluesselung mit Passwort oder Entsperr-Code.
 * Beim allerersten Login (kein Schluesselpaar vorhanden) wird eines erzeugt,
 * der private Schluessel mit dem abgeleiteten KEK verschluesselt und auf dem
 * Server hinterlegt. Der KEK bleibt im Speicher dieser Sitzung.
 */
export async function ensureCryptoUnlocked(secret: string): Promise<void> {
  // Nur ein Netzfehler darf die Keychain-Ablage einspringen lassen. Ein
  // HTTP-Fehler (401) hat schon das Logout ausgeloest und ist kein Fall fuer
  // den Offline-Pfad. Die Ablage ist ein Notpfad: Wurde das Schluesselpaar
  // auf einem anderen Geraet neu registriert, passt sie nicht mehr und das
  // Entpacken der DEKs scheitert spaeter -- nie still, sondern mit Fehler.
  let resp: Response | null = null;
  let data: Record<string, unknown>;
  let fromKeychain = false;
  try {
    resp = await apiFetch(`${API_BASE}/crypto/key`, { headers: headers() });
    data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    const cached = await secureStore.readKeyMaterial();
    if (!cached) throw new Error("Schluesselmaterial ist offline nicht verfuegbar.");
    data = { hasKeypair: true, ...cached };
    fromKeychain = true;
  }

  // Ohne bestaetigte Serverantwort nie ein neues Schluesselpaar erzeugen:
  // Eine Fehlerantwort (500, kaputtes JSON) wuerde sonst als "noch kein
  // Keypair" gelesen und ein frisches Paar ueber bestehendes Schluessel-
  // material legen -- die alten DEK-Umschlaege waeren unbrauchbar.
  if (!fromKeychain && !resp!.ok) {
    throw new Error("Verschluesselung konnte nicht geladen werden.");
  }

  if (data.hasKeypair) {
    if (
      typeof data.saltEnc !== "string" ||
      typeof data.encryptedPrivateKey !== "string" ||
      typeof data.publicKey !== "string"
    ) {
      throw new Error("Schluesselmaterial ist unvollstaendig.");
    }
    const kek = await keyManager.deriveKey(secret, data.saltEnc);
    const privateKey = await keyManager.decryptWithKey(data.encryptedPrivateKey, kek);
    keyManager.setCryptoSession({
      kek,
      keypair: { publicKey: fromBase64(data.publicKey), privateKey },
      saltEnc: data.saltEnc,
    });
    if (!fromKeychain) {
      await secureStore.writeKeyMaterial({
        publicKey: data.publicKey,
        encryptedPrivateKey: data.encryptedPrivateKey,
        saltEnc: data.saltEnc,
      });
    }
    await setStoreCryptoLocked(false);
    return;
  }

  // Nur wenn der Server explizit "kein Keypair" sagt, wird eines erzeugt.
  // Jede andere Antwort (leer, unbekannt) ist ein Vertragsfehler und darf
  // kein bestehendes Schluesselmaterial ueberschreiben.
  if (data.hasKeypair !== false) {
    throw new Error("Schluesselmaterial ist unvollstaendig.");
  }

  // Erst-Login: Schluesselpaar erzeugen und Chiffrat auf dem Server ablegen.
  const saltEnc = await keyManager.generateSalt();
  const kek = await keyManager.deriveKey(secret, saltEnc);
  const kp = await keyManager.generateKeypair();
  const encryptedPrivateKey = await keyManager.encryptWithKey(kp.privateKey, kek);
  const registerResp = await apiFetch(`${API_BASE}/crypto/key`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({
      publicKey: toBase64(kp.publicKey),
      encryptedPrivateKey,
      saltEnc,
    }),
  });
  if (!registerResp.ok) {
    const error = await registerResp.json().catch(() => ({}));
    throw new Error(error.error ?? "Schluesselmaterial konnte nicht gespeichert werden.");
  }
  keyManager.setCryptoSession({ kek, keypair: kp, saltEnc });
  await secureStore.writeKeyMaterial({ publicKey: toBase64(kp.publicKey), encryptedPrivateKey, saltEnc });
  clearDekCache();
  await setStoreCryptoLocked(false);
}

const ApiService = {
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
      const resp = await fetchWithTimeout(`${API_BASE}/auth/session`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      }, 10_000);
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data.token) return null;
      setAuthToken(data.token);
      const user: User = { ...data.user, permissions: data.permissions ?? [] };
      // Sitzung da, aber der Entschluesselungs-Key fehlt noch (Reload).
      await syncCryptoLockState();
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
   * Lokale Anmeldung: Das Passwort verlaesst das Geraet nie. Aus ihm werden
   * lokal zwei unabhaengige Argon2id-Keys abgeleitet (Login-Proof an den
   * Server, Verschuesselungs-Key auf dem Geraet), danach wird das eigene
   * Schluesselpaar entsperrt bzw. beim ersten Login eingerichtet.
   */
  async loginLocal(providerKey: string, username: string, password: string, schoolId?: string): Promise<{ user: User; isTealUnlocked: boolean; token: string }> {
    const params = await fetchAuthParams(providerKey, username, schoolId);
    const proof = await keyManager.deriveKey(password, params.saltLogin);
    const resp = await fetchWithTimeout(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify({ providerKey, username, proof: toBase64(proof), ...(schoolId ? { schoolId } : {}) }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Anmeldung fehlgeschlagen");
    if (typeof data.token !== "string") throw new Error("Anmeldung fehlgeschlagen");
    setAuthToken(data.token);
    await ensureCryptoUnlocked(password);
    return { user: { ...data.user, permissions: data.permissions ?? [] }, isTealUnlocked: data.isTealUnlocked, token: data.token };
  },

  async registerLocalAccount(input: { email: string; password: string; username?: string; firstName?: string; lastName?: string; joinCode?: string; schoolId?: string }): Promise<string> {
    // Salt und Proof entstehen lokal; der Server bekommt nur den Proof.
    const saltLogin = await keyManager.generateSalt();
    const proof = await keyManager.deriveKey(input.password, saltLogin);
    const { password: _password, ...rest } = input;
    const resp = await fetchWithTimeout(`${API_BASE}/auth/local/register`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...rest, proof: toBase64(proof), loginSalt: saltLogin }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Registrierung fehlgeschlagen");
    return data.message ?? "";
  },

  async verifyLocalEmail(token: string): Promise<{ message: string; isApproved: boolean }> {
    const resp = await fetchWithTimeout(`${API_BASE}/auth/local/verify`, { method: "POST", headers: headers(), body: JSON.stringify({ token }) });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Bestätigungslink ist ungültig oder abgelaufen");
    return { message: data.message ?? "", isApproved: data.isApproved === true };
  },

  async resendLocalVerification(email: string, schoolId?: string): Promise<string> {
    const resp = await fetchWithTimeout(`${API_BASE}/auth/local/verify/resend`, { method: "POST", headers: headers(), body: JSON.stringify({ email, ...(schoolId ? { schoolId } : {}) }) });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Bestätigungs-Mail konnte nicht angefordert werden");
    return data.message ?? "";
  },

  async requestPasswordReset(email: string, schoolId?: string): Promise<string> {
    const resp = await fetchWithTimeout(`${API_BASE}/auth/local/password/forgot`, { method: "POST", headers: headers(), body: JSON.stringify({ email, ...(schoolId ? { schoolId } : {}) }) });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Passwort-Reset konnte nicht angefordert werden");
    return data.message ?? "";
  },

  async resetLocalPassword(token: string, password: string): Promise<void> {
    const saltLogin = await keyManager.generateSalt();
    const proof = await keyManager.deriveKey(password, saltLogin);
    const resp = await fetchWithTimeout(`${API_BASE}/auth/local/password/reset`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ token, proof: toBase64(proof), loginSalt: saltLogin }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Passwort konnte nicht zurückgesetzt werden");
  },

async changePassword(currentPassword: string, newPassword: string): Promise<string> {
    // Auch hier verlassen nur abgeleitete Werte das Geraet. Der private
    // Schluessel wird mit dem neuen KEK neu verschluesselt; der oeffentliche
    // Schluessel bleibt unveraendert.
    const loginSalt = await fetchAuthParamsForCurrentUser();
    if (!loginSalt) throw new Error("Aktuelles Passwort kann nicht geprueft werden.");
    const currentProof = await keyManager.deriveKey(currentPassword, loginSalt);
    const saltLogin = await keyManager.generateSalt();
    const newProof = await keyManager.deriveKey(newPassword, saltLogin);

    let crypto: { encryptedPrivateKey: string; saltEnc: string } | undefined;
    const kp = keyManager.getKeypair();
    const saltEnc = keyManager.getSaltEnc();
    if (kp && saltEnc) {
      const newKek = await keyManager.deriveKey(newPassword, saltEnc);
      crypto = { encryptedPrivateKey: await keyManager.encryptWithKey(kp.privateKey, newKek), saltEnc };
    }

    const resp = await apiFetch(`${API_BASE}/auth/password/change`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ currentProof: toBase64(currentProof), newProof: toBase64(newProof), newLoginSalt: saltLogin, crypto }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Passwort konnte nicht geändert werden");
    if (typeof data.token !== "string") throw new Error("Neues Sitzungstoken fehlt");
    setAuthToken(data.token);
    await ensureCryptoUnlocked(newPassword);
    return data.token;
  },

  /** Nativer Apple-Login: fragt einen Einmal-Nonce an, den die App an Apple weitergibt. */
  async startAppleNative(): Promise<string> {
    const resp = await fetchWithTimeout(`${API_BASE}/auth/apple/native/start`, {
      method: "POST",
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || typeof data.nonce !== "string") throw new Error("Anmeldung fehlgeschlagen");
    return data.nonce;
  },

  async completeAppleNative(input: {
    identityToken: string;
    nonce: string;
    fullName?: { givenName?: string; familyName?: string };
    email?: string;
    schoolId?: string;
  }): Promise<{ user: User; isTealUnlocked: boolean; token: string }> {
    const resp = await fetchWithTimeout(`${API_BASE}/auth/apple/native/complete`, {
      method: "POST",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify(input),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      // Schul-Zugangscode noetig: die Fehlerantwort traegt den einmaligen
      // Handoff mit, der den Schul-Code-Screen fuettert.
      if (data?.code === "JOIN_CODE_REQUIRED" && typeof data.handoff === "string") {
        throw new AuthError(data.error ?? "Der Schul-Zugangscode fehlt.", data.handoff);
      }
      throw new Error(data.error ?? "Anmeldung fehlgeschlagen");
    }
    if (typeof data.token !== "string") throw new Error("Anmeldung fehlgeschlagen");
    setAuthToken(data.token);
    await syncCryptoLockState();
    return { user: { ...data.user, permissions: data.permissions ?? [] }, isTealUnlocked: data.isTealUnlocked, token: data.token };
  },

  /**
   * Loest den Schul-Zugangscode eines frischen OIDC/Apple-Kontos ein
   * (POST /auth/join-code). Erfolg ist ein Login wie jeder andere.
   */
  async completeJoinCode(handoff: string, joinCode: string): Promise<{ user: User; isTealUnlocked: boolean; token: string }> {
    const resp = await fetchWithTimeout(`${API_BASE}/auth/join-code`, {
      method: "POST",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify({ handoff, joinCode }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Der Schul-Zugangscode ist falsch.");
    if (typeof data.token !== "string") throw new Error("Anmeldung fehlgeschlagen");
    setAuthToken(data.token);
    await syncCryptoLockState();
    return { user: { ...data.user, permissions: data.permissions ?? [] }, isTealUnlocked: data.isTealUnlocked, token: data.token };
  },

  async exchangeNativeSession(code: string, verifier: string): Promise<{ user: User; isTealUnlocked: boolean; token: string } | null> {
    const resp = await fetchWithTimeout(`${API_BASE}/auth/native-session`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ code, verifier }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (typeof data.token !== "string") return null;
    setAuthToken(data.token);
    await syncCryptoLockState();
    return {
      user: { ...data.user, permissions: data.permissions ?? [] },
      isTealUnlocked: data.isTealUnlocked,
      token: data.token,
    };
  },

  /**
   * Anmeldewege dieser Installation. Oeffentlicher Endpunkt, kein Cookie
   * noetig. Wirft bei Netzfehler oder Zeitlimit -- der Aufrufer entscheidet,
   * wie der Anmeldebildschirm bei einem Ausfall dieses Abrufs aussieht.
   */
  async getAuthProviders(schoolId?: string): Promise<AuthProvidersResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const url = schoolId
        ? `${API_BASE}/auth/providers?schoolId=${encodeURIComponent(schoolId)}`
        : `${API_BASE}/auth/providers`;
      const resp = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error("Anmeldewege konnten nicht geladen werden");
      const data = await resp.json();
      return {
        providers: Array.isArray(data.providers) ? data.providers : [],
        joinCodeRequired: data.joinCodeRequired === true,
      };
    } finally {
      clearTimeout(timeout);
    }
  },

  async getAuthIdentities(): Promise<AuthIdentityInfo[]> {
    const resp = await apiFetch(`${API_BASE}/auth/identities`, { headers: headers() });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Verbundene Anmeldewege konnten nicht geladen werden");
    return Array.isArray(data.identities) ? data.identities : [];
  },

  /** Entfernt einen verknuepften Anmeldeweg (DELETE /auth/identities/:id). */
  async removeAuthIdentity(id: string): Promise<void> {
    const resp = await apiFetch(`${API_BASE}/auth/identities/${id}`, {
      method: "DELETE",
      headers: headers(),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Anmeldeweg konnte nicht entfernt werden");
    }
  },

  async startAuthLink(providerKey: string, returnTo: string): Promise<string> {
    const resp = await apiFetch(`${API_BASE}/auth/link/${encodeURIComponent(providerKey)}/start`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ returnTo }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Anmeldeweg konnte nicht verknuepft werden");
    if (typeof data.redirectUrl !== "string") throw new Error("Weiterleitungsadresse fehlt");
    return data.redirectUrl;
  },

  /** URL des Weiterleitungsstarts eines Anmeldewegs (GET /auth/:provider/start). */
  getProviderStartUrl(providerKey: string, returnTo?: string, handoffChallenge?: string, schoolId?: string): string {
    const url = `${API_BASE}/auth/${encodeURIComponent(providerKey)}/start`;
    if (!returnTo) return url;
    const params = new URLSearchParams({ returnTo });
    if (handoffChallenge) params.set("handoffChallenge", handoffChallenge);
    if (schoolId) params.set("schoolId", schoolId);
    return `${url}?${params}`;
  },

  /**
   * Aktive Schulen im Cloud-Betrieb (GET /auth/schools). Der Schul-Waehler
   * zeigt sie vor der Anmeldung. Im Selbsthosting leer.
   */
  async getSchools(): Promise<SchoolsResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const resp = await fetch(`${API_BASE}/auth/schools`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error("Schulen konnten nicht geladen werden");
      const data = await resp.json();
      return {
        multiTenant: data.multiTenant === true,
        schools: Array.isArray(data.schools) ? data.schools : [],
      };
    } finally {
      clearTimeout(timeout);
    }
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
      await fetchWithTimeout(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: headers(),
        credentials: "include",
      });
    } catch {
      // absichtlich ignoriert
    }
    // Geraete abmelden, solange das Bearer-Token noch gilt. Dynamische
    // Imports, weil beide Dienste ihrerseits diesen ApiService importieren.
    try {
      const { unregisterPushNotifications } = await import("./PushNotificationService");
      await unregisterPushNotifications();
    } catch {
      // absichtlich ignoriert
    }
    try {
      const { disableWebPush } = await import("./WebPushService");
      await disableWebPush();
    } catch {
      // absichtlich ignoriert
    }
    const { useAppStore } = await import("@/store/useAppStore");
    const userId = useAppStore.getState().user?.id;
    if (userId) {
      try {
        await clearIncidentDraftsForUser(userId);
      } catch {
        // A storage failure must not leave the account signed in.
      }
    }
    setAuthToken(null);
    // Verschluesseltes Schluesselmaterial gehoert nicht ueber Abmeldungen
    // hinweg auf dem Geraet -- die Sitzung ohne KEK kann es nicht nutzen.
    await secureStore.clearKeyMaterial();
    // KEK und entschluesselter privater Schluessel hoeren auf, sobald die
    // Sitzung endet: kein Material im Speicher ueber den Logout hinaus.
    keyManager.clearCryptoSession();
    clearDekCache();
  },

  /** Loescht das eigene Konto (POST /auth/account/delete) und raeumt lokal auf. */
  async deleteAccount(): Promise<void> {
    const resp = await apiFetch(`${API_BASE}/auth/account/delete`, {
      method: "POST",
      headers: headers(),
      credentials: "include",
    });
    if (!resp.ok && resp.status !== 204) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Konto konnte nicht geloescht werden");
    }
    await this.logout();
  },

  async getPrivacyRequests(): Promise<PrivacyRequest[]> {
    const resp = await apiFetch(`${API_BASE}/privacy/requests`, { headers: headers() });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Datenschutzanfragen konnten nicht geladen werden");
    return Array.isArray(data) ? data : [];
  },

  async createPrivacyRequest(input: {
    requestType: PrivacyRequestType;
    subjectName: string;
    subjectRelation?: string;
  }): Promise<PrivacyRequest> {
    const resp = await apiFetch(`${API_BASE}/privacy/requests`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(input),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Datenschutzanfrage konnte nicht gespeichert werden");
    return data as PrivacyRequest;
  },

  async updatePrivacyRequest(id: string, status: PrivacyRequestStatus): Promise<PrivacyRequest> {
    const resp = await apiFetch(`${API_BASE}/privacy/requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ status }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Datenschutzanfrage konnte nicht aktualisiert werden");
    return data as PrivacyRequest;
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

  async signupNews(id: string): Promise<NewsItem> {
    const resp = await apiFetch(`${API_BASE}/news/${id}/signup`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Anmeldung fehlgeschlagen");
    }
    return resp.json();
  },

  async unsignNews(id: string): Promise<NewsItem> {
    const resp = await apiFetch(`${API_BASE}/news/${id}/unsign`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Abmeldung fehlgeschlagen");
    }
    return resp.json();
  },

  async setMeetingNotify(id: string, enabled: boolean): Promise<NewsItem> {
    const resp = await apiFetch(`${API_BASE}/news/${id}/meeting-notify`, {
      method: "POST", headers: headers(), body: JSON.stringify({ enabled }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Einstellung konnte nicht gespeichert werden");
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

  async getShifts(from?: string, to?: string): Promise<Shift[]> {
    const qs = from && to ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : "";
    const resp = await apiFetch(`${API_BASE}/roster${qs}`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Dienstplan konnte nicht geladen werden");
    }
    return resp.json();
  },

  async createShift(input: {
    title: string;
    location?: string;
    startsAt: string;
    endsAt: string;
    memberIds: string[];
  }): Promise<Shift> {
    const resp = await apiFetch(`${API_BASE}/roster`, { method: "POST", headers: headers(), body: JSON.stringify(input) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Schicht konnte nicht angelegt werden");
    }
    return resp.json();
  },

  async updateShift(
    id: string,
    input: Partial<{ title: string; location: string | null; startsAt: string; endsAt: string }>,
  ): Promise<Shift> {
    const resp = await apiFetch(`${API_BASE}/roster/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify(input) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Schicht konnte nicht geändert werden");
    }
    return resp.json();
  },

  async deleteShift(id: string): Promise<void> {
    const resp = await apiFetch(`${API_BASE}/roster/${id}`, { method: "DELETE", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Schicht konnte nicht gelöscht werden");
    }
  },

  async addShiftMember(id: string, userId: string): Promise<Shift> {
    const resp = await apiFetch(`${API_BASE}/roster/${id}/members`, { method: "POST", headers: headers(), body: JSON.stringify({ userId }) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Mitglied konnte nicht hinzugefügt werden");
    }
    return resp.json();
  },

  async removeShiftMember(id: string, userId: string): Promise<Shift> {
    const resp = await apiFetch(`${API_BASE}/roster/${id}/members/${encodeURIComponent(userId)}`, { method: "DELETE", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Mitglied konnte nicht entfernt werden");
    }
    return resp.json();
  },

  /** Schicht selbst uebernehmen (POST /roster/:id/join). */
  async joinShift(id: string): Promise<Shift> {
    const resp = await apiFetch(`${API_BASE}/roster/${id}/join`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Schicht konnte nicht übernommen werden");
    }
    return resp.json();
  },

  /** Schicht selbst verlassen (POST /roster/:id/leave). */
  async leaveShift(id: string): Promise<Shift> {
    const resp = await apiFetch(`${API_BASE}/roster/${id}/leave`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Schicht konnte nicht verlassen werden");
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

  async getMyActivity(): Promise<MissionActivityLog[]> {
    const resp = await apiFetch(`${API_BASE}/activity/my`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Aktivitäten konnten nicht geladen werden");
    }
    return resp.json();
  },

  async getUserActivity(userId: string): Promise<MissionActivityLog[]> {
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

  /** Korrigiert den Namen eines fremden Kontos (PATCH /users/:id/profile, users.correct_profile). */
  async correctUserProfile(id: string, firstName: string, lastName: string): Promise<User> {
    const resp = await apiFetch(`${API_BASE}/users/${id}/profile`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ firstName, lastName }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Profil konnte nicht korrigiert werden");
    return data;
  },

  async deleteUser(id: string): Promise<void> {
    const resp = await apiFetch(`${API_BASE}/users/${id}`, { method: "DELETE", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Benutzer konnte nicht gelöscht werden");
    }
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
    const rows = await resp.json();
    return Promise.all(rows.map((r: EncryptedReportRow) => decryptReport(r))) as Promise<IncidentReport[]>;
  },

  async getIncidentReport(id: string): Promise<IncidentReport> {
    const resp = await apiFetch(`${API_BASE}/incident-reports/${id}`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Protokoll konnte nicht geladen werden");
    }
    return decryptReport(await resp.json()) as Promise<IncidentReport>;
  },

  async createIncidentReport(data: Partial<IncidentReport>): Promise<IncidentReport> {
    const { contentEncrypted, contentKeyVersion, metadata } = await encryptReportPayload({ ...data });
    const resp = await apiFetch(`${API_BASE}/incident-reports`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...metadata, contentEncrypted, contentKeyVersion }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error ?? "Protokoll konnte nicht erstellt werden");
    }
    return decryptReport(await resp.json()) as Promise<IncidentReport>;
  },

  async updateIncidentReport(id: string, data: Partial<IncidentReport>): Promise<IncidentReport> {
    const { contentEncrypted, contentKeyVersion, metadata } = await encryptReportPayload({ ...data });
    const resp = await apiFetch(`${API_BASE}/incident-reports/${id}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ ...metadata, contentEncrypted, contentKeyVersion }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error ?? "Protokoll konnte nicht aktualisiert werden");
    }
    return decryptReport(await resp.json()) as Promise<IncidentReport>;
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
    return decryptReport(await resp.json()) as Promise<IncidentReport>;
  },

  async addReportAddendum(id: string, text: string): Promise<IncidentReport> {
    // Nachtraege liegen im verschluesselten Inhalt: entschluesseln, anhaengen,
    // komplett neu verschluesseln -- der Server sieht weiterhin nur Chiffrat.
    const current = await this.getIncidentReport(id);
    const { useAppStore } = await import("@/store/useAppStore");
    const user = useAppStore.getState().user;
    const addendum = {
      authorId: user?.id ?? "",
      authorName: `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || "?",
      text,
      createdAt: new Date().toISOString(),
    };
    const addenda = [...(current.addenda ?? []), addendum];
    const { contentEncrypted, contentKeyVersion } = await encryptReportPayload({ ...current, addenda });
    const resp = await apiFetch(`${API_BASE}/incident-reports/${id}/addendum`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ contentEncrypted, contentKeyVersion, updatedAt: current.updatedAt }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error ?? "Nachtrag konnte nicht hinzugefügt werden");
    }
    return decryptReport(await resp.json()) as Promise<IncidentReport>;
  },

  /** Kopfzeilen fuer Abrufe ausserhalb von `headers()`, das faelschlich JSON deklariert. */
  getAuthHeaders(): Record<string, string> {
    return {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };
  },
  // --- Owner-only database console ---

  // ── Datenexport der Schule ──

  async getExportOverview(): Promise<{
    interval: "semiannual" | "annual" | "five_years";
    lastExportAt: string | null;
    exports: {
      id: string;
      fromAt: string | null;
      toAt: string;
      reportCount: number;
      status: "ready" | "downloaded";
      downloadedAt: string | null;
      createdAt: string;
    }[];
  }> {
    const resp = await apiFetch(`${API_BASE}/exports`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Export-Einstellungen konnten nicht geladen werden");
    }
    return resp.json();
  },

  async setExportInterval(interval: "semiannual" | "annual" | "five_years"): Promise<void> {
    const resp = await apiFetch(`${API_BASE}/exports`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ interval }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Intervall konnte nicht gespeichert werden");
    }
  },

  async createExport(): Promise<{ id: string; reportCount: number; status: string }> {
    const resp = await apiFetch(`${API_BASE}/exports`, {
      method: "POST",
      headers: headers(),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Export konnte nicht erstellt werden");
    return data;
  },

  /**
   * Verschluesseltes Export-Buendel (kein Seiteneffekt). Das PDF baut der
   * Client nach der lokalen Entschluesselung; erst die Bestaetigung loescht
   * die exportierten Protokolle vom Server.
   */
  async getExportBundle(id: string): Promise<{ id: string; fromAt: string | null; toAt: string; reports: IncidentReport[] }> {
    const resp = await apiFetch(`${API_BASE}/exports/${id}/bundle`, { headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Export konnte nicht geladen werden");
    }
    const bundle = await resp.json();
    // Strikt: Nicht entschluesselbare Protokolle duerfen den Export nicht
    // bestaetigbar machen (der Server wuerde sie sonst loeschen).
    const reports = await Promise.all((bundle.reports ?? []).map((r: EncryptedReportRow) => decryptReport(r, true)));
    return { id: bundle.id, fromAt: bundle.fromAt ?? null, toAt: bundle.toAt, reports };
  },

  async confirmExport(id: string): Promise<void> {
    const resp = await apiFetch(`${API_BASE}/exports/${id}/confirm`, { method: "POST", headers: headers() });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Export konnte nicht bestätigt werden");
    }
  },

  // --- Ende-zu-Ende-Verschluesselung: Schluesselverwaltung ---

  async getMyCryptoKey(): Promise<{
    hasKeypair: boolean;
    publicKey?: string;
    encryptedPrivateKey?: string;
    saltEnc?: string;
    keyVersion?: number;
  }> {
    const resp = await apiFetch(`${API_BASE}/crypto/key`, { headers: headers() });
    return resp.json().catch(() => ({ hasKeypair: false }));
  },

  async listSchoolPublicKeys(): Promise<{ userId: string; publicKey: string }[]> {
    const resp = await apiFetch(`${API_BASE}/crypto/keys`, { headers: headers() });
    const data = await resp.json().catch(() => ({}));
    return Array.isArray(data.keys) ? data.keys : [];
  },

  async getMyDekWraps(): Promise<{ latestVersion: number | null; wraps: DekWrap[] }> {
    const resp = await apiFetch(`${API_BASE}/crypto/dek`, { headers: headers() });
    return resp.json().catch(() => ({ latestVersion: null, wraps: [] }));
  },

  /** Schulweiten Datenschluessel erzeugen (erster Verwalter) oder rotieren. */
  async initDek(): Promise<number> {
    const kp = keyManager.getKeypair();
    if (!kp) throw new UnlockRequiredError();
    const sodium = (await import("./crypto/sodium")).loadSodium;
    const s = await sodium();
    const dek = s.randombytes_buf(32);
    const dekVersion = (await this.getMyDekWraps()).latestVersion ?? 0;
    const next = dekVersion + 1;
    const wrappedDek = await keyManager.wrapFor(dek, toBase64(kp.publicKey));
    const resp = await apiFetch(`${API_BASE}/crypto/dek`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ wrappedDek, dekVersion: next }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Datenschluessel konnte nicht angelegt werden");
    dekCache.set(next, dek);
    return next;
  },

  /** DEK-Zugriff fuer eine andere Person freigeben (Grant) oder neu verpacken (Recovery). */
  async grantDek(targetUserId: string, recover = false): Promise<void> {
    const kp = keyManager.getKeypair();
    if (!kp) throw new UnlockRequiredError();
    const { wraps } = await this.getMyDekWraps();
    const wrap = wraps[0];
    if (!wrap) throw new Error("Du hast selbst keinen Datenschluessel.");
    const dek = dekCache.get(wrap.dekVersion) ?? (await keyManager.unwrapDek(wrap.wrappedDek, kp));
    dekCache.set(wrap.dekVersion, dek);

    const keys = await this.listSchoolPublicKeys();
    const target = keys.find((k) => k.userId === targetUserId);
    if (!target) throw new Error("Die Person hat noch kein Schluesselpaar.");
    if (recover) {
      // Recovery nach Geraeteverlust: bewusster Ersatz des gepinnten Fingerprints.
      await keyManager.forgetPublicKeyPin(targetUserId);
    }
    await keyManager.assertPublicKeyPinned(targetUserId, target.publicKey);
    const wrappedDek = await keyManager.wrapFor(dek, target.publicKey);
    const resp = await apiFetch(`${API_BASE}/crypto/dek/grant`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ targetUserId, wrappedDek, dekVersion: wrap.dekVersion, recover }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Zugriff konnte nicht freigegeben werden");
  },

};

export default ApiService;
