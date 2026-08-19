import type { DutyStatus, IncidentReport, LOARequest, Mission, NewsItem, Shift } from "@/models";

import { toBase64 } from "../crypto/encoding";
import { setCryptoSession } from "../crypto/keyManager";
import { loadSodium } from "../crypto/sodium";

import {
  BENACHRICHTIGUNGEN,
  EINSAETZE,
  ICH,
  NEUIGKEITEN,
  PROTOKOLLE,
  ROLLEN,
  SCHICHTEN,
  TEAM,
} from "./daten";

/**
 * Oeffentliche Vorschau ohne Server: ein Ersatz fuer `fetch`, der die eigenen
 * API-Aufrufe abfaengt und aus festen Daten beantwortet. Geschrieben wird nur in
 * diesen Speicher -- ein Neuladen stellt den Ausgangszustand wieder her.
 *
 * Der Ersatz haengt am globalen `fetch` statt am ApiService, weil die
 * Anmeldestrecke roh `fetch` benutzt und der Rest ueber `apiFetch` laeuft.
 */
const stand = {
  einsaetze: EINSAETZE.map((m) => ({ ...m })),
  schichten: SCHICHTEN.map((s) => ({ ...s, members: [...s.members] })),
  protokolle: PROTOKOLLE.map((r) => ({ ...r })),
  news: NEUIGKEITEN.map((n) => ({ ...n })),
  benachrichtigungen: BENACHRICHTIGUNGEN.map((n) => ({ ...n })),
  loa: [] as LOARequest[],
  dienst: { userId: ICH.id, status: "on_duty", updatedAt: new Date().toISOString() } as DutyStatus,
};

let laufendeNummer = 100;
const naechsteId = (prefix: string) => `${prefix}-${++laufendeNummer}`;
const jetzt = () => new Date().toISOString();

// Demo-Kryptografie: Damit auch neue Protokolle erstellt und eingereicht werden
// koennen, bekommt die Vorschau eine echte Sitzung (Schluesselpaar + DEK). Der
// Schluessel existiert nur im Speicher dieser Seite und wird nie persistiert.
let demoDekWrap: string | null = null;

async function demoCryptoBereitstellen(): Promise<void> {
  try {
    const s = await loadSodium();
    const kp = s.crypto_box_keypair();
    const dek = s.randombytes_buf(32);
    demoDekWrap = toBase64(s.crypto_box_seal(dek, kp.publicKey));
    setCryptoSession({
      kek: s.randombytes_buf(32),
      keypair: kp,
      saltEnc: "demo",
    });
  } catch {
    // Ohne Krypto bleibt die Vorschau bedienbar; nur Protokoll-Erstellung
    // schlaegt dann mit dem ueblichen Entsperr-Hinweis fehl.
  }
}

function json(koerper: unknown, status = 200): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function einsatz(id: string): Mission | undefined {
  return stand.einsaetze.find((m) => m.id === id);
}

function schicht(id: string): Shift | undefined {
  return stand.schichten.find((s) => s.id === id);
}

function antwort(pfad: string, methode: string, koerper: Record<string, unknown>): unknown {
  const teile = pfad.split("/").filter(Boolean);
  const [bereich, zweites, drittes] = teile;

  if (bereich === "auth") {
    if (zweites === "session") {
      return { token: "demo", user: ICH, permissions: ICH.permissions, isTealUnlocked: true };
    }
    if (zweites === "providers") {
      return { providers: [{ key: "local", displayName: "E-Mail", type: "local" }], joinCodeRequired: false };
    }
    if (zweites === "schools") {
      // Cloud-Betrieb: die Vorschau zeigt nach dem Abmelden den Schul-Waehler
      // und den Schul-ID-Einstieg wie in der echten Multi-Tenant-App.
      return { multiTenant: true, schools: [{ id: "demo", name: "Demo-Schule", joinCodeRequired: false }] };
    }
    if (zweites === "login") {
      return { token: "demo", user: ICH, permissions: ICH.permissions };
    }
    return {};
  }

  if (bereich === "crypto") {
    if (zweites === "dek") {
      // Ein DEK-Umschlag fuer die Demo-Sitzung, damit neue Protokolle
      // ver- und entschluesselt werden koennen.
      return { wraps: demoDekWrap ? [{ dekVersion: 1, wrappedDek: demoDekWrap }] : [] };
    }
    // Ohne `hasKeypair` im Body laesst syncCryptoLockState die Sperre aus --
    // in der Vorschau gibt es keine Schluessel und nichts zu entsperren.
    return {};
  }

  if (bereich === "missions") {
    if (!zweites) {
      if (methode === "POST") {
        const neu: Mission = {
          id: naechsteId("m"),
          title: String(koerper.title ?? "Neuer Einsatz"),
          description: String(koerper.description ?? ""),
          location: String(koerper.location ?? ""),
          priority: (koerper.priority as Mission["priority"]) ?? "medium",
          status: "pending",
          requestedAt: jetzt(),
          scheduledFor: jetzt(),
        };
        stand.einsaetze.unshift(neu);
        return neu;
      }
      return stand.einsaetze;
    }
    const m = einsatz(zweites);
    if (!m) return {};
    if (drittes === "accept") {
      m.status = "accepted";
      m.assignedParamedicId = ICH.id;
    }
    if (drittes === "reject") m.status = "rejected";
    if (drittes === "dismiss") m.status = "archived";
    return m;
  }

  if (bereich === "roster") {
    if (!zweites) {
      if (methode === "POST") {
        const neu: Shift = {
          id: naechsteId("s"),
          schoolId: ICH.schoolId,
          title: String(koerper.title ?? "Schicht"),
          location: (koerper.location as string) ?? null,
          startsAt: String(koerper.startsAt ?? jetzt()),
          endsAt: String(koerper.endsAt ?? jetzt()),
          createdAt: jetzt(),
          updatedAt: jetzt(),
          members: [],
        };
        stand.schichten.push(neu);
        return neu;
      }
      return stand.schichten;
    }
    const s = schicht(zweites);
    if (!s) return {};
    if (drittes === "join") {
      if (!s.members.some((m) => m.userId === ICH.id)) {
        s.members.push({ userId: ICH.id, userName: `${ICH.firstName} ${ICH.lastName}` });
      }
    }
    if (drittes === "leave") {
      s.members = s.members.filter((m) => m.userId !== ICH.id);
    }
    if (methode === "DELETE" && !drittes) {
      stand.schichten = stand.schichten.filter((x) => x.id !== s.id);
      return {};
    }
    return s;
  }

  if (bereich === "incident-reports") {
    if (!zweites) {
      if (methode === "POST") {
        const neu = {
          ...(koerper.metadata as Record<string, unknown>),
          id: naechsteId("r"),
          schoolId: ICH.schoolId,
          authorId: ICH.id,
          status: "draft",
          createdAt: jetzt(),
          updatedAt: jetzt(),
        } as IncidentReport;
        stand.protokolle.unshift(neu);
        return neu;
      }
      return stand.protokolle;
    }
    const r = stand.protokolle.find((x) => x.id === zweites);
    if (!r) return {};
    if (drittes === "submit") {
      r.status = "submitted";
      r.submittedAt = jetzt();
    }
    if (methode === "PUT" || methode === "PATCH") {
      Object.assign(r, koerper.metadata ?? koerper, { updatedAt: jetzt() });
    }
    return r;
  }

  if (bereich === "status") {
    if (zweites === "on-duty") return TEAM.slice(0, 2);
    if (methode === "POST") {
      stand.dienst = {
        userId: ICH.id,
        status: (koerper.status as "on_duty" | "off_duty") ?? "off_duty",
        updatedAt: jetzt(),
      };
    }
    return stand.dienst;
  }

  if (bereich === "news") {
    if (zweites === "read-all") {
      stand.news.forEach((n) => { n.isRead = true; });
      return {};
    }
    if (!zweites) {
      if (methode === "POST") {
        const neu: NewsItem = {
          id: naechsteId("n"),
          title: String(koerper.title ?? ""),
          summary: String(koerper.summary ?? ""),
          content: String(koerper.content ?? ""),
          category: (koerper.category as NewsItem["category"]) ?? "announcement",
          status: "pending",
          publishedAt: jetzt(),
          author: `${ICH.firstName} ${ICH.lastName}`,
          authorId: ICH.id,
          isRead: false,
          translationsJson: null,
        };
        stand.news.unshift(neu);
        return neu;
      }
      return stand.news;
    }
    const n = stand.news.find((x) => x.id === zweites);
    if (!n) return {};
    if (drittes === "approve") n.status = "approved";
    if (drittes === "reject") {
      n.status = "rejected";
      n.rejectionReason = String(koerper.reason ?? "");
    }
    if (drittes === "read") n.isRead = true;
    if (methode === "PATCH") Object.assign(n, koerper);
    if (methode === "DELETE") {
      stand.news = stand.news.filter((x) => x.id !== zweites);
      return {};
    }
    return n;
  }

  if (bereich === "notifications") {
    if (zweites === "read-all") {
      stand.benachrichtigungen.forEach((x) => { x.isRead = true; });
      return {};
    }
    return stand.benachrichtigungen;
  }
  if (bereich === "roles") return zweites === "permissions" ? [] : ROLLEN;
  if (bereich === "users") return zweites === "pending" ? [] : TEAM;

  if (bereich === "loa") {
    if (!zweites) {
      if (methode === "POST") {
        const neu: LOARequest = {
          id: naechsteId("l"),
          userId: String(koerper.userId ?? ICH.id),
          userName: String(koerper.userName ?? `${ICH.firstName} ${ICH.lastName}`),
          fromDate: String(koerper.fromDate ?? jetzt()),
          toDate: String(koerper.toDate ?? jetzt()),
          reason: String(koerper.reason ?? ""),
          status: "pending",
          createdAt: jetzt(),
        };
        stand.loa.unshift(neu);
        return neu;
      }
      return stand.loa;
    }
    const l = stand.loa.find((x) => x.id === zweites);
    if (!l) return {};
    if (drittes === "approve") {
      l.status = "approved";
      l.adminNote = String(koerper.note ?? "");
    }
    if (drittes === "reject") {
      l.status = "rejected";
      l.adminNote = String(koerper.reason ?? "");
    }
    if (drittes === "appeal") {
      l.status = "appealed";
      l.appealNote = String(koerper.appealNote ?? "");
    }
    return l;
  }

  if (bereich === "activity") return [];

  return {};
}

export function installiereVorschau(): void {
  void demoCryptoBereitstellen();

  const echtesFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (eingabe: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof eingabe === "string" ? eingabe : eingabe instanceof URL ? eingabe.href : eingabe.url;
    const trenner = url.indexOf("/api/");
    if (trenner === -1) return echtesFetch(eingabe as RequestInfo, init);

    const pfad = url.slice(trenner + 4).split("?")[0];
    const methode = (init?.method ?? "GET").toUpperCase();
    let koerper: Record<string, unknown> = {};
    if (typeof init?.body === "string") {
      try {
        koerper = JSON.parse(init.body);
      } catch {
        koerper = {};
      }
    }

    return json(antwort(pfad, methode, koerper));
  };
}
