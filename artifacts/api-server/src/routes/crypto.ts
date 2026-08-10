import { Router } from "express";
import { and, desc, eq, isNotNull, or } from "drizzle-orm";
import { db, userCryptoKeysTable, schoolDeksTable, schoolDekWrapsTable, incidentReportsTable, usersTable, missionsTable } from "@workspace/db";
import { requireAuth, requirePermission, schoolIdOf, type AuthRequest } from "../middlewares/auth";
import {
  isValidCryptoBlob, isValidKeyVersion, isValidSalt,
  logCryptoGrant, schoolUserOrNull, upsertDekWrap, upsertUserCryptoKey,
} from "../lib/userCrypto";
import { logReportAccess } from "../lib/reportAccessLog";

const router = Router();

// Klartextspalten eines Alt-Protokolls, die bei der Migration geleert werden.
// Alles, was Gesundheitsinhalt traegt, wandert in content_encrypted.
const PLAINTEXT_COLUMNS = {
  title: null,
  patientType: null,
  patientFirstName: null,
  patientLastName: null,
  patientClass: null,
  patientAge: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  category: null,
  description: null,
  injurySites: null,
  measures: null,
  treatmentNotes: null,
  pulseBpm: null,
  spo2: null,
  respRate: null,
  bloodPressure: null,
  consciousnessAvpu: null,
  painScore: null,
  outcome: null,
  outcomeNotes: null,
  witnesses: null,
  addendaJson: null,
} as const;

async function withMissionTitle(report: typeof incidentReportsTable.$inferSelect) {
  if (!report.missionId) return { ...report, missionTitle: null };
  const [mission] = await db
    .select({ title: missionsTable.title })
    .from(missionsTable)
    .where(eq(missionsTable.id, report.missionId));
  return { ...report, missionTitle: mission?.title ?? null };
}

// GET /crypto/key — eigenes Schluesselmaterial (nur Chiffrat und oeffentliche Teile)
router.get("/key", requireAuth, async (req: AuthRequest, res) => {
  const [row] = await db
    .select()
    .from(userCryptoKeysTable)
    .where(eq(userCryptoKeysTable.userId, req.user!.userId))
    .limit(1);
  if (!row) {
    res.json({ hasKeypair: false });
    return;
  }
  res.json({
    hasKeypair: true,
    publicKey: row.publicKey,
    encryptedPrivateKey: row.encryptedPrivateKey,
    saltEnc: row.saltEnc,
    keyVersion: row.keyVersion,
  });
});

// PUT /crypto/key — eigenes Schluesselpaar registrieren oder ersetzen.
// Der private Schluessel kommt nur verschluesselt an; der KEK bleibt auf dem Geraet.
router.put("/key", requireAuth, async (req: AuthRequest, res) => {
  const body = req.body as { publicKey?: unknown; encryptedPrivateKey?: unknown; saltEnc?: unknown };
  if (!isValidCryptoBlob(body.publicKey) || !isValidCryptoBlob(body.encryptedPrivateKey) || !isValidSalt(body.saltEnc)) {
    res.status(400).json({ error: "Schluesselmaterial ist ungueltig." });
    return;
  }
  await upsertUserCryptoKey(db, req.user!.userId, {
    publicKey: body.publicKey,
    encryptedPrivateKey: body.encryptedPrivateKey,
    saltEnc: body.saltEnc,
  });
  res.json({ ok: true });
});

// GET /crypto/keys — oeffentliche Schluessel der Schule (fuer das DEK-Wrapping).
// Oeffentliche Schluessel sind keine Geheimnisse; der Client pinnt sie lokal
// (TOFU), damit ein boeswilliger Server keinen stillen Austausch bewerkstelligen kann.
router.get("/keys", requireAuth, async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const rows = await db
    .select({ userId: usersTable.id, publicKey: userCryptoKeysTable.publicKey })
    .from(usersTable)
    .innerJoin(userCryptoKeysTable, eq(userCryptoKeysTable.userId, usersTable.id))
    .where(eq(usersTable.schoolId, schoolId));
  res.json({ keys: rows });
});

// GET /crypto/dek — die fuer den Aufrufer verpackten DEKs.
router.get("/dek", requireAuth, async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const [latest] = await db
    .select({ version: schoolDeksTable.version })
    .from(schoolDeksTable)
    .where(eq(schoolDeksTable.schoolId, schoolId))
    .orderBy(desc(schoolDeksTable.version))
    .limit(1);
  const wraps = await db
    .select({
      dekVersion: schoolDekWrapsTable.dekVersion,
      wrappedDek: schoolDekWrapsTable.wrappedDek,
      createdAt: schoolDekWrapsTable.createdAt,
    })
    .from(schoolDekWrapsTable)
    .where(and(eq(schoolDekWrapsTable.schoolId, schoolId), eq(schoolDekWrapsTable.userId, req.user!.userId)))
    .orderBy(desc(schoolDekWrapsTable.dekVersion));
  res.json({ latestVersion: latest?.version ?? null, wraps });
});

// POST /crypto/dek — DEK-Version anlegen (Init) und den Umschlag fuer sich selbst ablegen.
// Das Verpacken passiert client-seitig; der Server sieht nur den Umschlag.
router.post("/dek", requireAuth, requirePermission("reports.read_all", "reports.see_patient_info"), async (req: AuthRequest, res) => {
  const body = req.body as { wrappedDek?: unknown; dekVersion?: unknown };
  const wrappedDek = body.wrappedDek;
  const dekVersion = body.dekVersion;
  if (!isValidCryptoBlob(wrappedDek) || !isValidKeyVersion(dekVersion)) {
    res.status(400).json({ error: "Umschlag oder Version ist ungueltig." });
    return;
  }
  const schoolId = schoolIdOf(req);
  const [me] = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.userId));
  const actorName = `${me?.firstName ?? ""} ${me?.lastName ?? ""}`.trim() || null;

  await db.transaction(async (tx) => {
    await tx.insert(schoolDeksTable).values({ schoolId, version: dekVersion }).onConflictDoNothing();
    await upsertDekWrap(tx, {
      schoolId,
      userId: req.user!.userId,
      dekVersion,
      wrappedDek,
      grantedBy: req.user!.userId,
    });
    await logCryptoGrant(tx, {
      schoolId,
      actorId: req.user!.userId,
      actorName,
      targetUserId: req.user!.userId,
      action: dekVersion === 1 ? "init" : "grant",
      dekVersion,
    });
  });
  res.status(201).json({ dekVersion });
});

// POST /crypto/dek/grant — Umschlag fuer eine andere Person ablegen (Grant oder Recovery).
// Nur Personen mit Protokoll-/Patientenrecht duerfen verteilen; das Verpacken
// selbst geschieht in ihrem Client. Kein Master-Schluessel auf dem Server.
router.post("/dek/grant", requireAuth, requirePermission("reports.read_all", "reports.see_patient_info"), async (req: AuthRequest, res) => {
  const body = req.body as { targetUserId?: unknown; wrappedDek?: unknown; dekVersion?: unknown; recover?: unknown };
  const targetUserId = body.targetUserId;
  const wrappedDek = body.wrappedDek;
  const dekVersion = body.dekVersion;
  const recover = body.recover === true;
  if (
    typeof targetUserId !== "string" || targetUserId.length === 0 || targetUserId.length > 100 ||
    !isValidCryptoBlob(wrappedDek) || !isValidKeyVersion(dekVersion)
  ) {
    res.status(400).json({ error: "Zielperson oder Umschlag ist ungueltig." });
    return;
  }
  const schoolId = schoolIdOf(req);
  const target = await schoolUserOrNull(schoolId, targetUserId);
  if (!target) {
    res.status(404).json({ error: "Zielperson ist nicht Teil der Schule." });
    return;
  }
  const [me] = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.userId));
  const actorName = `${me?.firstName ?? ""} ${me?.lastName ?? ""}`.trim() || null;

  await db.transaction(async (tx) => {
    await upsertDekWrap(tx, {
      schoolId,
      userId: target.id,
      dekVersion,
      wrappedDek,
      grantedBy: req.user!.userId,
    });
    await logCryptoGrant(tx, {
      schoolId,
      actorId: req.user!.userId,
      actorName,
      targetUserId: target.id,
      action: recover ? "recover" : "grant",
      dekVersion,
    });
  });
  res.status(201).json({ dekVersion });
});

// --- Migration von Alt-Protokollen (einmalig, nur mit Patientenrecht) ---

// GET /crypto/legacy-reports — Protokolle, deren Klartext noch nicht verschluesselt ist.
router.get("/legacy-reports", requireAuth, requirePermission("reports.see_patient_info"), async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const rows = await db
    .select({ id: incidentReportsTable.id })
    .from(incidentReportsTable)
    .where(and(
      eq(incidentReportsTable.schoolId, schoolId),
      or(
        isNotNull(incidentReportsTable.description),
        isNotNull(incidentReportsTable.patientFirstName),
        isNotNull(incidentReportsTable.patientLastName),
      ),
    ));
  logReportAccess({ schoolId, userId: req.user!.userId, action: "list", patientVisible: true, count: rows.length });
  res.json({ reports: rows });
});

// GET /crypto/legacy-reports/:id — Klartext eines Alt-Protokolls fuer den Migrations-Client.
// Der Endpunkt bleibt bewusst zeitlich begrenzt: Nach der Migration existiert
// kein Klartext mehr auf dem Server.
router.get("/legacy-reports/:id", requireAuth, requirePermission("reports.see_patient_info"), async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const [report] = await db
    .select()
    .from(incidentReportsTable)
    .where(and(eq(incidentReportsTable.id, (req.params.id as string)), eq(incidentReportsTable.schoolId, schoolId)));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  logReportAccess({ schoolId, userId: req.user!.userId, reportId: report.id, action: "detail", patientVisible: true });
  res.json(await withMissionTitle(report));
});

// PUT /crypto/legacy-reports/:id — Chiffrat speichern und Klartextspalten leeren.
router.put("/legacy-reports/:id", requireAuth, requirePermission("reports.see_patient_info"), async (req: AuthRequest, res) => {
  const body = req.body as { contentEncrypted?: unknown; contentKeyVersion?: unknown };
  if (!isValidCryptoBlob(body.contentEncrypted, 200_000) || !isValidKeyVersion(body.contentKeyVersion)) {
    res.status(400).json({ error: "Chiffrat oder Version ist ungueltig." });
    return;
  }
  const schoolId = schoolIdOf(req);
  const [report] = await db
    .select({ id: incidentReportsTable.id })
    .from(incidentReportsTable)
    .where(and(eq(incidentReportsTable.id, (req.params.id as string)), eq(incidentReportsTable.schoolId, schoolId)));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }

  // Klartextspalten leeren: Nach der Migration existiert kein Klartext mehr
  // auf dem Server, auch nicht in den Alt-Spalten.
  await db.update(incidentReportsTable)
    .set({ contentEncrypted: body.contentEncrypted, contentKeyVersion: body.contentKeyVersion, ...PLAINTEXT_COLUMNS, updatedAt: new Date() })
    .where(eq(incidentReportsTable.id, report.id));
  res.json({ ok: true });
});

export default router;
