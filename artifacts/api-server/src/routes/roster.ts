import { randomUUID } from "crypto";
import { Router } from "express";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db, shiftsTable, shiftMembersTable, usersTable } from "@workspace/db";
import { requireAuth, requirePermission, schoolIdOf, type AuthRequest } from "../middlewares/auth";

const router = Router();

const MAX_MEMBERS = 50;
const MAX_TEXT = 200;

function resolveName(row: { firstName: string | null; lastName: string | null }, id: string): string {
  return `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || id;
}

async function loadOneShift(schoolId: string, shiftId: string) {
  const [shift] = await db
    .select()
    .from(shiftsTable)
    .where(and(eq(shiftsTable.id, shiftId), eq(shiftsTable.schoolId, schoolId)));
  if (!shift) return null;
  const members = await db
    .select()
    .from(shiftMembersTable)
    .where(and(eq(shiftMembersTable.schoolId, schoolId), eq(shiftMembersTable.shiftId, shiftId)))
    .orderBy(asc(shiftMembersTable.createdAt));
  return { ...shift, members };
}

// Schichten samt Mitgliedern laden: ein Abruf fuer die Schichten, einer fuer
// die Mitglieder aller gefundenen Schichten (kein N+1).
async function loadShiftsWithMembers(schoolId: string, fromIso?: string, toIso?: string) {
  const conds = [eq(shiftsTable.schoolId, schoolId)];
  if (fromIso) conds.push(gte(shiftsTable.startsAt, new Date(fromIso)));
  if (toIso) conds.push(lt(shiftsTable.startsAt, new Date(toIso)));
  const shifts = await db
    .select()
    .from(shiftsTable)
    .where(and(...conds))
    .orderBy(asc(shiftsTable.startsAt));
  if (shifts.length === 0) return [];
  const members = await db
    .select()
    .from(shiftMembersTable)
    .where(and(eq(shiftMembersTable.schoolId, schoolId), inArray(shiftMembersTable.shiftId, shifts.map((s) => s.id))))
    .orderBy(asc(shiftMembersTable.createdAt));
  const byShift = new Map<string, (typeof members)[number][]>();
  for (const m of members) {
    const list = byShift.get(m.shiftId) ?? [];
    list.push(m);
    byShift.set(m.shiftId, list);
  }
  return shifts.map((s) => ({ ...s, members: byShift.get(s.id) ?? [] }));
}

// Gibt die gueltigen Mitglieds-Ids zurueck: nur Nutzer, die zu dieser Schule
// gehoeren. Unbekannte Ids werden uebergangen statt abgelehnt, damit eine
// geloeschte Person den Plan nicht blockiert.
async function resolveMembers(schoolId: string, ids: string[]) {
  const clean = Array.from(new Set(ids.filter((x): x is string => typeof x === "string"))).slice(0, MAX_MEMBERS);
  if (clean.length === 0) return [];
  return db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(and(eq(usersTable.schoolId, schoolId), inArray(usersTable.id, clean)));
}

function parseTimeBounds(startsAt: unknown, endsAt: unknown): { startsAt: Date; endsAt: Date } | string {
  const start = new Date(startsAt as string);
  const end = new Date(endsAt as string);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return "startsAt and endsAt must be valid dates, endsAt after startsAt";
  }
  return { startsAt: start, endsAt: end };
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  if (from && isNaN(new Date(from).getTime())) {
    res.status(400).json({ error: "from must be a valid ISO date" });
    return;
  }
  if (to && isNaN(new Date(to).getTime())) {
    res.status(400).json({ error: "to must be a valid ISO date" });
    return;
  }
  res.json(await loadShiftsWithMembers(schoolId, from, to));
});

router.post("/", requireAuth, requirePermission("roster.manage"), async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const body = req.body ?? {};
  const title = body.title;
  if (typeof title !== "string" || title.trim().length === 0 || title.length > MAX_TEXT) {
    res.status(400).json({ error: "title required, max 200 characters" });
    return;
  }
  const location = typeof body.location === "string" && body.location.trim() !== "" ? body.location.trim() : null;
  if (location !== null && location.length > MAX_TEXT) {
    res.status(400).json({ error: "location max 200 characters" });
    return;
  }
  const bounds = parseTimeBounds(body.startsAt, body.endsAt);
  if (typeof bounds === "string") {
    res.status(400).json({ error: bounds });
    return;
  }
  const members = await resolveMembers(schoolId, Array.isArray(body.memberIds) ? body.memberIds : []);
  const id = randomUUID();
  await db.insert(shiftsTable).values({
    id,
    schoolId,
    title: title.trim(),
    location,
    startsAt: bounds.startsAt,
    endsAt: bounds.endsAt,
    createdBy: req.user!.userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  if (members.length > 0) {
    await db.insert(shiftMembersTable).values(
      members.map((u) => ({
        id: randomUUID(),
        schoolId,
        shiftId: id,
        userId: u.id,
        userName: resolveName(u, u.id),
        createdAt: new Date(),
      })),
    );
  }
  res.status(201).json({
    ...(await loadOneShift(schoolId, id)),
  });
});

router.patch("/:id", requireAuth, requirePermission("roster.manage"), async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const body = req.body ?? {};
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0 || body.title.length > MAX_TEXT) {
      res.status(400).json({ error: "title max 200 characters" });
      return;
    }
    set.title = body.title.trim();
  }
  if (body.location !== undefined) {
    if (body.location !== null && (typeof body.location !== "string" || body.location.length > MAX_TEXT)) {
      res.status(400).json({ error: "location max 200 characters" });
      return;
    }
    set.location = body.location || null;
  }
  if (body.startsAt !== undefined || body.endsAt !== undefined) {
    const existing = await loadOneShift(schoolId, req.params.id as string);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const bounds = parseTimeBounds(body.startsAt ?? existing.startsAt, body.endsAt ?? existing.endsAt);
    if (typeof bounds === "string") {
      res.status(400).json({ error: bounds });
      return;
    }
    set.startsAt = bounds.startsAt;
    set.endsAt = bounds.endsAt;
  }
  const [row] = await db
    .update(shiftsTable)
    .set(set)
    .where(and(eq(shiftsTable.id, req.params.id as string), eq(shiftsTable.schoolId, schoolId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(await loadOneShift(schoolId, row.id));
});

router.delete("/:id", requireAuth, requirePermission("roster.manage"), async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const [row] = await db
    .delete(shiftsTable)
    .where(and(eq(shiftsTable.id, req.params.id as string), eq(shiftsTable.schoolId, schoolId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).end();
});

router.post("/:id/members", requireAuth, requirePermission("roster.manage"), async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const shift = await loadOneShift(schoolId, req.params.id as string);
  if (!shift) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const userId = req.body?.userId;
  if (typeof userId !== "string") {
    res.status(400).json({ error: "userId required" });
    return;
  }
  if (shift.members.length >= MAX_MEMBERS) {
    res.status(400).json({ error: "member limit reached" });
    return;
  }
  const [user] = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.schoolId, schoolId)))
    .limit(1);
  if (!user) {
    res.status(400).json({ error: "user not found in this school" });
    return;
  }
  // onConflictDoNothing: das UNIQUE(shift_id, user_id) faengt parallele
  // Doppelbuchungen ab, ohne einen 500 auszuloesen.
  await db
    .insert(shiftMembersTable)
    .values({
      id: randomUUID(),
      schoolId,
      shiftId: shift.id,
      userId: user.id,
      userName: resolveName(user, user.id),
      createdAt: new Date(),
    })
    .onConflictDoNothing();
  res.status(201).json(await loadOneShift(schoolId, shift.id));
});

router.delete("/:id/members/:userId", requireAuth, requirePermission("roster.manage"), async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const deleted = await db
    .delete(shiftMembersTable)
    .where(and(
      eq(shiftMembersTable.shiftId, req.params.id as string),
      eq(shiftMembersTable.userId, req.params.userId as string),
      eq(shiftMembersTable.schoolId, schoolId),
    ))
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(await loadOneShift(schoolId, req.params.id as string));
});

export default router;
