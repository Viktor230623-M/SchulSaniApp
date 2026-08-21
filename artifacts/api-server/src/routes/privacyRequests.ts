import { randomUUID } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { and, desc, eq } from "drizzle-orm";
import { z } from "@workspace/api-zod";
import { db, privacyRequestsTable, usersTable } from "@workspace/db";
import { requireAuth, requirePermission, schoolIdOf, type AuthRequest } from "../middlewares/auth";
import { validate } from "../middlewares/validate";

const router = Router();

const requestTypes = ["access", "rectification", "erasure", "restriction", "portability", "objection"] as const;
const requestStatuses = ["pending", "in_review", "fulfilled", "rejected"] as const;

const createRequestBody = z.object({
  requestType: z.enum(requestTypes),
  subjectName: z.string().trim().min(1).max(120),
  subjectRelation: z.string().trim().max(40).optional(),
});

const updateRequestBody = z.object({
  status: z.enum(requestStatuses),
});

const requestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => (req as AuthRequest).user?.userId ?? req.ip ?? "unknown",
  message: { error: "Zu viele Anfragen, bitte spaeter erneut versuchen." },
});

function publicRequest(row: typeof privacyRequestsTable.$inferSelect) {
  return {
    id: row.id,
    schoolId: row.schoolId,
    requesterId: row.requesterId,
    requesterEmail: row.requesterEmail,
    requestType: row.requestType,
    subjectName: row.subjectName,
    subjectRelation: row.subjectRelation,
    status: row.status,
    handledBy: row.handledBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt,
  };
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const canManage = req.user!.permissions?.includes("users.read_all") === true;
  const rows = await db
    .select()
    .from(privacyRequestsTable)
    .where(canManage
      ? eq(privacyRequestsTable.schoolId, schoolId)
      : and(eq(privacyRequestsTable.schoolId, schoolId), eq(privacyRequestsTable.requesterId, req.user!.userId)))
    .orderBy(desc(privacyRequestsTable.createdAt));
  res.json(rows.map(publicRequest));
});

router.post("/", requireAuth, requestLimiter, validate({ body: createRequestBody }), async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const [requester] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.id, req.user!.userId), eq(usersTable.schoolId, schoolId)))
    .limit(1);
  if (!requester) {
    res.status(401).json({ error: "Konto ist nicht mehr verfuegbar." });
    return;
  }

  const row: typeof privacyRequestsTable.$inferInsert = {
    id: randomUUID(),
    schoolId,
    requesterId: req.user!.userId,
    requesterEmail: requester.email,
    requestType: req.body.requestType,
    subjectName: req.body.subjectName,
    subjectRelation: req.body.subjectRelation || null,
    status: "pending",
    handledBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
  };
  const [created] = await db.insert(privacyRequestsTable).values(row).returning();
  res.status(201).json(publicRequest(created!));
});

router.patch("/:id", requireAuth, requirePermission("users.read_all"), validate({ body: updateRequestBody }), async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const status = req.body.status as (typeof requestStatuses)[number];
  const resolvedAt = status === "fulfilled" || status === "rejected" ? new Date() : null;
  const [updated] = await db
    .update(privacyRequestsTable)
    .set({
      status,
      handledBy: req.user!.userId,
      updatedAt: new Date(),
      resolvedAt,
    })
    .where(and(eq(privacyRequestsTable.id, req.params.id as string), eq(privacyRequestsTable.schoolId, schoolId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Anfrage nicht gefunden." });
    return;
  }
  res.json(publicRequest(updated));
});

export default router;
