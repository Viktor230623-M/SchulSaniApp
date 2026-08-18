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
  let ids: { aAdmin: string; aSani: string; bAdmin: string; reportA: string; reportB: string };

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

    await db.execute(sql`TRUNCATE users, notifications, device_tokens, incident_reports CASCADE`);

    ids = { aAdmin: "u-a-admin", aSani: "u-a-sani", bAdmin: "u-b-admin", reportA: "r-a", reportB: "r-b" };
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
  });

  afterAll(async () => {
    await db.execute(sql`TRUNCATE users, notifications, device_tokens, incident_reports CASCADE`);
  });

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
});
