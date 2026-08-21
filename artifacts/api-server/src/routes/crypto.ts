import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, userCryptoKeysTable, schoolDeksTable, schoolDekWrapsTable, usersTable } from "@workspace/db";
import { requireAuth, requireAuthAllowUnconfirmedProfile, requirePermission, schoolIdOf, type AuthRequest } from "../middlewares/auth";
import {
  isValidCryptoBlob, isValidKeyVersion, isValidSalt,
  logCryptoGrant, schoolUserOrNull, upsertDekWrap, upsertUserCryptoKey,
} from "../lib/userCrypto";

const router = Router();

// GET /crypto/key — eigenes Schluesselmaterial (nur Chiffrat und oeffentliche Teile).
// Bewusst ohne Namensbestaetigung: Der Erst-Login erzeugt das Paar, bevor der
// Name bestaetigt ist (frisches lokales oder OIDC-Konto). Es ist ausschliesslich
// das eigene Material des Nutzers; die Sperre gilt weiterhin fuer alle Routen,
// die fremde oder Gesundheitsdaten beruehren.
router.get("/key", requireAuthAllowUnconfirmedProfile, async (req: AuthRequest, res) => {
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
// Wie GET ohne Namensbestaetigung, damit Erst-Login und Entsperr-Screen das
// Paar anlegen koennen.
router.put("/key", requireAuthAllowUnconfirmedProfile, async (req: AuthRequest, res) => {
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

export default router;
