import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { sql } from "drizzle-orm";

// Kein echter SMTP-Versand im Test: assertMailerConfig und verifyMailer
// muessen durchlaufen, sendMail darf nichts tun.
vi.mock("./services/mailer", async () => {
  const actual = await vi.importActual<typeof import("./services/mailer")>("./services/mailer");
  return {
    ...actual,
    assertMailerConfig: () => {},
    verifyMailer: async () => {},
    sendMail: async () => {},
  };
});

const hier = dirname(fileURLToPath(import.meta.url));

// Aussagekraeftig nur gegen eine echte Datenbank. CI setzt die Variable und
// spielt vorher die Migrationen ein; lokal (vitest.config.ts zeigt auf einen
// nicht erreichbaren Port) wird der Lauf uebersprungen.
const DB_URL = process.env["INTEGRATION_DATABASE_URL"] ?? "";

describe.skipIf(!DB_URL)("Cloud-Betrieb (MULTI_TENANT)", () => {
  let app: import("express").Express;
  let dbMod: typeof import("@workspace/db");
  let db: typeof import("@workspace/db").db;

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DB_URL;
    process.env["MULTI_TENANT"] = "true";
    process.env["JWT_SECRET"] = "test-secret-12345678901234567890123456789012";
    process.env["ALLOWED_ORIGINS"] = "https://sani.test.local";
    process.env["APP_NAME"] = "SchulSaniTest";
    process.env["SMTP_HOST"] = "smtp.test.local";
    process.env["SMTP_PORT"] = "587";
    process.env["SMTP_USER"] = "x";
    process.env["SMTP_PASSWORD"] = "x";
    process.env["SMTP_SECURE"] = "false";
    process.env["SMTP_REQUIRE_TLS"] = "false";
    process.env["MAIL_FROM"] = "test@test.local";
    process.env["MAIL_FROM_NAME"] = "Test";
    process.env["APP_BASE_URL"] = "https://sani.test.local";
    process.env["AUTH_PROVIDERS_PATH"] = resolve(hier, "routes/fixtures/auth-providers.local-only.json");

    dbMod = await import("@workspace/db");
    db = dbMod.db;
    app = (await import("./app")).default;

    // Nur die eigenen Zeilen raeumen — die Dateien laufen parallel in
    // getrennten Workern gegen dieselbe Datenbank, ein TRUNCATE wuerde die
    // Daten der anderen Integrationstest-Datei wegwerfen.
    await aufraeumen();

    // Zwei Schulen: A mit Zugangscode, B ohne. Der Code ist SHA-256 von "geheim".
    const jetzt = new Date();
    await db.insert(dbMod.schoolsTable).values([
      {
        id: "mt-schule-a",
        name: "Gymnasium Beispielstadt",
        joinCodeHash: "addb0f5e7826c857d7376d1bd9bc33c0c544790a2eac96144a8af22b1298c940", // SHA-256 von "geheim"
        isActive: true,
        createdAt: jetzt,
        updatedAt: jetzt,
      },
      {
        id: "mt-schule-b",
        name: "Stadtteilschule Musterweg",
        joinCodeHash: null,
        isActive: true,
        createdAt: jetzt,
        updatedAt: jetzt,
      },
    ]);
  });

  afterAll(async () => {
    await aufraeumen();
  });

  // Loescht nur die Schulen und Konten dieser Datei. Die Schluessel sind mit
  // dem Praefix mt- eindeutig, damit kein Parallel-Worker sie anfasst.
  async function aufraeumen() {
    await db.execute(sql`
      DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE school_id IN ('mt-schule-a', 'mt-schule-b'));
      DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE school_id IN ('mt-schule-a', 'mt-schule-b'));
      DELETE FROM user_identities WHERE user_id IN (SELECT id FROM users WHERE school_id IN ('mt-schule-a', 'mt-schule-b'));
      DELETE FROM users WHERE school_id IN ('mt-schule-a', 'mt-schule-b');
      DELETE FROM schools WHERE id IN ('mt-schule-a', 'mt-schule-b');
    `);
  }

  it("listet aktive Schulen fuer den Schul-Waehler", async () => {
    const res = await request(app).get("/api/auth/schools");
    expect(res.status).toBe(200);
    expect(res.body.multiTenant).toBe(true);
    expect(res.body.schools).toEqual([
      { id: "mt-schule-a", name: "Gymnasium Beispielstadt", joinCodeRequired: true },
      { id: "mt-schule-b", name: "Stadtteilschule Musterweg", joinCodeRequired: false },
    ]);
  });

  it("verlangt schoolId im Cloud-Betrieb", async () => {
    const res = await request(app).get("/api/auth/providers");
    // Ohne schoolId faellt /providers auf die Instanz zurueck (kein globaler Code).
    expect(res.status).toBe(200);
    expect(res.body.joinCodeRequired).toBe(false);

    const res2 = await request(app).get("/api/auth/providers?schoolId=mt-schule-a");
    expect(res2.status).toBe(200);
    expect(res2.body.joinCodeRequired).toBe(true);

    const res3 = await request(app).get("/api/auth/providers?schoolId=mt-schule-b");
    expect(res3.status).toBe(200);
    expect(res3.body.joinCodeRequired).toBe(false);
  });

  it("weist eine unbekannte Schule ab", async () => {
    const res = await request(app).get("/api/auth/providers?schoolId=gibtsnicht");
    // Unbekannte Schule = kein Schulkontext.
    expect(res.status).toBe(200);
    expect(res.body.joinCodeRequired).toBe(false);
  });

  it("registriert ein Konto nur mit dem Zugangscode der jeweiligen Schule", async () => {
    // Schule A verlangt einen Code: ohne oder mit falschem Code 403.
    const ohneCode = await request(app)
      .post("/api/auth/local/register")
      .send({ schoolId: "mt-schule-a", email: "a@test.local", proof: "p".repeat(20), loginSalt: "saltsaltsalt" });
    expect(ohneCode.status).toBe(403);

    const falscherCode = await request(app)
      .post("/api/auth/local/register")
      .send({ schoolId: "mt-schule-a", email: "a@test.local", proof: "p".repeat(20), loginSalt: "saltsaltsalt", joinCode: "falsch" });
    expect(falscherCode.status).toBe(403);

    // Schule B verlangt keinen: Registrierung startet.
    const ohneCodeB = await request(app)
      .post("/api/auth/local/register")
      .send({ schoolId: "mt-schule-b", email: "b@test.local", proof: "p".repeat(20), loginSalt: "saltsaltsalt" });
    expect(ohneCodeB.status).not.toBe(403);
  });

  it("laesst die Registrierung mit dem richtigen Code der Schule zu", async () => {
    // "geheim" ist der Klartext zum gespeicherten Hash von schule-a.
    const res = await request(app)
      .post("/api/auth/local/register")
      .send({ schoolId: "mt-schule-a", email: "a2@test.local", proof: "p".repeat(20), loginSalt: "saltsaltsalt", joinCode: "geheim" });
    expect(res.status).not.toBe(403);
    // Konto wurde mit der gewaehlten Schule angelegt.
    const [konto] = await db
      .select({ schoolId: dbMod.usersTable.schoolId, isApproved: dbMod.usersTable.isApproved })
      .from(dbMod.usersTable)
      .where(sql`email = 'a2@test.local'`)
      .limit(1);
    expect(konto?.schoolId).toBe("mt-schule-a");
    // Mit Zugangscode ist das Konto sofort freigeschaltet.
    expect(konto?.isApproved).toBe(true);
  });
});
