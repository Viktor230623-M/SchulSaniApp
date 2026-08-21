import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { sql } from "drizzle-orm";

const hier = dirname(fileURLToPath(import.meta.url));

// Aussagekraeftig nur gegen eine echte Datenbank. CI setzt die Variable und
// spielt vorher die Migrationen ein; lokal (vitest.config.ts zeigt auf einen
// nicht erreichbaren Port) wird der Lauf uebersprungen.
const DB_URL = process.env["INTEGRATION_DATABASE_URL"] ?? "";

describe.skipIf(!DB_URL)("Mandantentrennung", () => {
  let app: import("express").Express;
  let dbMod: typeof import("@workspace/db");
  let db: typeof import("@workspace/db").db;
  let signToken: (payload: { userId: string; role: string; passwordVersion: number }) => string;
  let createNotifications: typeof import("./services/notifications").createNotificationForMultipleUsers;
  let ids: {
    aAdmin: string; aSani: string; bAdmin: string;
    reportA: string; reportB: string;
    newsB: string; exportB: string; missionB: string; shiftB: string; roleB: string;
  };

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DB_URL;
    process.env["JWT_SECRET"] = "test-secret-12345678901234567890123456789012";
    process.env["ALLOWED_ORIGINS"] = "https://sani.test.local";
    process.env["APP_NAME"] = "SchulSaniTest";
    process.env["AUTH_PROVIDERS_PATH"] = resolve(hier, "routes/fixtures/auth-providers.oidc-only.json");

    // Alle Module muessen die Umgebung oben sehen; Importe also erst hier.
    dbMod = await import("@workspace/db");
    db = dbMod.db;
    const auth = await import("./middlewares/auth");
    signToken = auth.signToken;
    const notifications = await import("./services/notifications");
    createNotifications = notifications.createNotificationForMultipleUsers;
    app = (await import("./app")).default;

    // Nur die eigenen Zeilen raeumen — die Dateien laufen parallel in
    // getrennten Workern gegen dieselbe Datenbank, ein TRUNCATE wuerde die
    // Daten der anderen Integrationstest-Datei wegwerfen.
    await aufraeumen();

    ids = {
      aAdmin: "u-a-admin", aSani: "u-a-sani", bAdmin: "u-b-admin",
      reportA: "r-a", reportB: "r-b",
      newsB: "news-b", exportB: "export-b", missionB: "mission-b", shiftB: "shift-b", roleB: "role-b",
    };
    const jetzt = new Date();

    // Zwei Schulen, jeweils mit freigeschaltetem Verwalter.
    await db.insert(dbMod.usersTable).values([
      {
        id: ids.aAdmin, schoolId: "schule-a", role: "admin", username: "a-admin",
        email: "a-admin@test.local", isApproved: true, profileConfirmedAt: jetzt,
        firstName: "Anna", lastName: "Admin", createdAt: jetzt, updatedAt: jetzt,
      },
      {
        id: ids.aSani, schoolId: "schule-a", role: "sanitaeter", username: "a-sani",
        email: "a-sani@test.local", isApproved: true, profileConfirmedAt: jetzt,
        firstName: "Ali", lastName: "Sanitaeter", createdAt: jetzt, updatedAt: jetzt,
      },
      {
        id: ids.bAdmin, schoolId: "schule-b", role: "admin", username: "b-admin",
        email: "b-admin@test.local", isApproved: true, profileConfirmedAt: jetzt,
        firstName: "Bernd", lastName: "Betreiber", createdAt: jetzt, updatedAt: jetzt,
      },
    ]);

    await db.insert(dbMod.notificationsTable).values([
      {
        id: "n-a", schoolId: "schule-a", userId: ids.aAdmin, type: "news",
        title: "A-Neuigkeit", body: "", priority: "normal", isRead: false, createdAt: jetzt,
      },
      {
        id: "n-b", schoolId: "schule-b", userId: ids.bAdmin, type: "news",
        title: "B-Neuigkeit", body: "", priority: "normal", isRead: false, createdAt: jetzt,
      },
    ]);

    await db.insert(dbMod.incidentReportsTable).values([
      {
        id: ids.reportA, schoolId: "schule-a", authorId: ids.aAdmin, status: "submitted",
        contentEncrypted: null, createdAt: jetzt, updatedAt: jetzt,
      },
      {
        id: ids.reportB, schoolId: "schule-b", authorId: ids.bAdmin, status: "submitted",
        contentEncrypted: null, createdAt: jetzt, updatedAt: jetzt,
      },
    ]);

    await db.insert(dbMod.deviceTokensTable).values([
      {
        id: "tok-b", schoolId: "schule-b", userId: ids.bAdmin,
        token: "fcm-token-b", platform: "android", createdAt: jetzt, updatedAt: jetzt,
      },
    ]);

    // Fremde Ressourcen der Schule B: News (Meeting mit Anmeldung), Export,
    // Einsatz, Schicht, Rolle und Schluesselmaterial.
    const inZukunft = new Date(jetzt.getTime() + 24 * 60 * 60 * 1000);
    await db.insert(dbMod.newsTable).values([{
      id: ids.newsB, schoolId: "schule-b", title: "B-Treffen", summary: "Treffen B", content: "Inhalt B",
      category: "announcement", status: "approved", publishedAt: jetzt,
      author: "Bernd Betreiber", authorId: ids.bAdmin,
      meetingAt: inZukunft, meetingNotifyOnSignup: true,
      meetingSignupsJson: [{ userId: ids.bAdmin, name: "Bernd Betreiber", signedAt: jetzt.toISOString() }],
    }]);
    await db.insert(dbMod.schoolExportsTable).values([{
      id: ids.exportB, schoolId: "schule-b", toAt: jetzt, reportCount: 1, status: "ready", createdAt: jetzt,
    }]);
    await db.insert(dbMod.missionsTable).values([{
      id: ids.missionB, schoolId: "schule-b", title: "Einsatz B", description: "Beschreibung", location: "Aula",
      priority: "medium", status: "pending", requestedAt: jetzt, scheduledFor: jetzt,
    }]);
    await db.insert(dbMod.shiftsTable).values([{
      id: ids.shiftB, schoolId: "schule-b", title: "Schicht B", startsAt: jetzt, endsAt: inZukunft,
      createdBy: ids.bAdmin, createdAt: jetzt, updatedAt: jetzt,
    }]);
    await db.insert(dbMod.rolesTable).values([{
      id: ids.roleB, schoolId: "schule-b", key: "rolle-b", displayName: "Rolle B",
      sortOrder: 0, isSystem: false, createdAt: jetzt, updatedAt: jetzt,
    }]);
    await db.insert(dbMod.userCryptoKeysTable).values([{
      userId: ids.bAdmin, publicKey: "pub-b", encryptedPrivateKey: "priv-b",
      saltEnc: "salt-b", keyVersion: 1, createdAt: jetzt, updatedAt: jetzt,
    }]);
  });

  afterAll(async () => {
    await aufraeumen();
  });

  // Loescht nur die Daten dieser Datei (Schule A/B und ihre Konten), damit
  // parallel laufende Integrationstest-Dateien ungestoert bleiben.
  async function aufraeumen() {
    await db.execute(sql`
      DELETE FROM report_access_log WHERE user_id IN ('u-a-admin', 'u-a-sani', 'u-b-admin');
      DELETE FROM mission_dismissals WHERE user_id IN ('u-a-admin', 'u-a-sani', 'u-b-admin');
      DELETE FROM news_reads WHERE user_id IN ('u-a-admin', 'u-a-sani', 'u-b-admin');
      DELETE FROM shift_members WHERE user_id IN ('u-a-admin', 'u-a-sani', 'u-b-admin');
      DELETE FROM notifications WHERE user_id IN ('u-a-admin', 'u-a-sani', 'u-b-admin');
      DELETE FROM device_tokens WHERE user_id IN ('u-a-admin', 'u-a-sani', 'u-b-admin');
      DELETE FROM news_reads WHERE news_id IN ('news-b');
      DELETE FROM school_exports WHERE school_id IN ('schule-a', 'schule-b');
      DELETE FROM shifts WHERE school_id IN ('schule-a', 'schule-b');
      DELETE FROM missions WHERE school_id IN ('schule-a', 'schule-b');
      DELETE FROM roles WHERE school_id IN ('schule-a', 'schule-b');
      DELETE FROM news WHERE school_id IN ('schule-a', 'schule-b');
      DELETE FROM user_crypto_keys WHERE user_id IN ('u-a-admin', 'u-a-sani', 'u-b-admin');
      DELETE FROM incident_reports WHERE school_id IN ('schule-a', 'schule-b');
      DELETE FROM sessions WHERE user_id IN ('u-a-admin', 'u-a-sani', 'u-b-admin');
      DELETE FROM user_identities WHERE user_id IN ('u-a-admin', 'u-a-sani', 'u-b-admin');
      DELETE FROM users WHERE id IN ('u-a-admin', 'u-a-sani', 'u-b-admin');
    `);
  }

  function token(userId: string, role: string): string {
    return signToken({ userId, role, passwordVersion: 0 });
  }

  it("A sieht nur Nutzer der eigenen Schule", async () => {
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${token(ids.aAdmin, "admin")}`);
    expect(res.status).toBe(200);
    const idsSeen = (res.body as { id: string }[]).map((u) => u.id);
    expect(idsSeen).toContain(ids.aAdmin);
    expect(idsSeen).toContain(ids.aSani);
    expect(idsSeen).not.toContain(ids.bAdmin);
  });

  it("A kann Bs Profil nicht abrufen", async () => {
    const res = await request(app)
      .get(`/api/users/${ids.bAdmin}`)
      .set("Authorization", `Bearer ${token(ids.aAdmin, "admin")}`);
    // Schul-Scope in der Abfrage: kein Datensatz gefunden, keine Existenz verraten.
    expect(res.status).toBe(404);
  });

  it("A kann Bs Konto nicht freischalten", async () => {
    const res = await request(app)
      .patch(`/api/users/${ids.bAdmin}/approve`)
      .set("Authorization", `Bearer ${token(ids.aAdmin, "admin")}`)
      .send({ role: "sanitaeter" });
    expect(res.status).toBe(404);
  });

  it("A sieht nur eigene Benachrichtigungen", async () => {
    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${token(ids.aAdmin, "admin")}`);
    expect(res.status).toBe(200);
    const rows = res.body as { id: string; schoolId: string }[];
    expect(rows.every((n) => n.schoolId === "schule-a")).toBe(true);
    expect(rows.map((n) => n.id)).toContain("n-a");
  });

  it("jede Schule sieht nur ihre eigenen Protokolle", async () => {
    const resA = await request(app)
      .get("/api/incident-reports")
      .set("Authorization", `Bearer ${token(ids.aAdmin, "admin")}`);
    expect(resA.status).toBe(200);
    expect((resA.body as { id: string }[]).map((r) => r.id)).toEqual([ids.reportA]);

    const resB = await request(app)
      .get("/api/incident-reports")
      .set("Authorization", `Bearer ${token(ids.bAdmin, "admin")}`);
    expect(resB.status).toBe(200);
    expect((resB.body as { id: string }[]).map((r) => r.id)).toEqual([ids.reportB]);
  });

  it("Geraeteregistrierung haengt am angemeldeten Konto, nicht am Request", async () => {
    await request(app)
      .post("/api/notifications/register-device")
      .set("Authorization", `Bearer ${token(ids.aAdmin, "admin")}`)
      .send({ token: "fcm-token-a", platform: "android" });
    const rows = await db
      .select({ schoolId: dbMod.deviceTokensTable.schoolId, userId: dbMod.deviceTokensTable.userId })
      .from(dbMod.deviceTokensTable)
      .where(sql`token = 'fcm-token-a'`);
    expect(rows).toEqual([{ schoolId: "schule-a", userId: ids.aAdmin }]);
  });

  it("Alarm in A erzeugt weder Benachrichtigung noch Push fuer B", async () => {
    const before = await db
      .select({ id: dbMod.deviceTokensTable.id })
      .from(dbMod.deviceTokensTable)
      .where(sql`user_id = 'u-b-admin'`);

    await createNotifications([ids.aAdmin], {
      schoolId: "schule-a",
      type: "high_priority_alert",
      title: "Alarm A",
      body: "",
      priority: "high",
    });

    // Keine Benachrichtigung fuer B in As Schule.
    const crossRows = await db
      .select({ id: dbMod.notificationsTable.id })
      .from(dbMod.notificationsTable)
      .where(sql`school_id = 'schule-a' AND user_id = 'u-b-admin'`);
    expect(crossRows).toEqual([]);

    // Bs Geraete-Token bleibt unangetastet (kein Versand nach B).
    const after = await db
      .select({ id: dbMod.deviceTokensTable.id })
      .from(dbMod.deviceTokensTable)
      .where(sql`user_id = 'u-b-admin'`);
    expect(after).toEqual(before);

    // As eigener Alarm ist angekommen.
    const ownRows = await db
      .select({ id: dbMod.notificationsTable.id })
      .from(dbMod.notificationsTable)
      .where(sql`school_id = 'schule-a' AND user_id = 'u-a-admin' AND type = 'high_priority_alert'`);
    expect(ownRows.length).toBe(1);
  });

  it("Schluesselliste der Schule zeigt keine fremden Schluessel", async () => {
    const res = await request(app)
      .get("/api/crypto/keys")
      .set("Authorization", `Bearer ${token(ids.aAdmin, "admin")}`);
    expect(res.status).toBe(200);
    const keys = res.body as { keys: { userId: string }[] };
    expect(keys.keys.map((k) => k.userId)).not.toContain(ids.bAdmin);
  });

  it("fremder Export ist weder gelistet noch abrufbar", async () => {
    const res = await request(app)
      .get("/api/exports")
      .set("Authorization", `Bearer ${token(ids.aAdmin, "admin")}`);
    expect(res.status).toBe(200);
    const exports = res.body as { exports: { id: string }[] };
    expect(exports.exports.map((e) => e.id)).not.toContain(ids.exportB);

    const bundle = await request(app)
      .get(`/api/exports/${ids.exportB}/bundle`)
      .set("Authorization", `Bearer ${token(ids.aAdmin, "admin")}`);
    expect(bundle.status).toBe(404);
  });

  it("fremdes Meeting ist unsichtbar, Anmeldung schlaegt fehl", async () => {
    const res = await request(app)
      .get("/api/news")
      .set("Authorization", `Bearer ${token(ids.aAdmin, "admin")}`);
    expect(res.status).toBe(200);
    const news = res.body as { id: string }[];
    expect(news.map((n) => n.id)).not.toContain(ids.newsB);

    const signup = await request(app)
      .post(`/api/news/${ids.newsB}/signup`)
      .set("Authorization", `Bearer ${token(ids.aAdmin, "admin")}`);
    expect(signup.status).toBe(404);
  });

  it("fremder Einsatz, fremde Schicht und fremde Rolle sind unsichtbar", async () => {
    const missions = await request(app)
      .get("/api/missions")
      .set("Authorization", `Bearer ${token(ids.aAdmin, "admin")}`);
    expect((missions.body as { id: string }[]).map((m) => m.id)).not.toContain(ids.missionB);

    const shifts = await request(app)
      .get("/api/roster")
      .set("Authorization", `Bearer ${token(ids.aAdmin, "admin")}`);
    expect((shifts.body as { id: string }[]).map((s) => s.id)).not.toContain(ids.shiftB);

    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${token(ids.aAdmin, "admin")}`);
    expect((roles.body as { id: string }[]).map((r) => r.id)).not.toContain(ids.roleB);
  });
});
