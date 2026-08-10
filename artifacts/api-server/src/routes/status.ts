import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, dutyTable, usersTable } from "@workspace/db";
import { requireAuth, schoolIdOf, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const [entry] = await db.select().from(dutyTable).where(and(eq(dutyTable.userId, userId), eq(dutyTable.schoolId, schoolId)));
  res.json(entry ?? { userId, status: "off_duty", updatedAt: new Date() });
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const { status } = req.body as { status: "on_duty" | "off_duty" };
  if (!["on_duty", "off_duty"].includes(status)) {
    res.status(400).json({ error: "status must be on_duty or off_duty" });
    return;
  }
  const schoolId = schoolIdOf(req);
  const entry = { schoolId, userId: userId, status, updatedAt: new Date() };
  await db.insert(dutyTable).values(entry).onConflictDoUpdate({
    target: dutyTable.userId,
    set: { status, updatedAt: new Date() },
  });
  res.json({ userId: userId, status, updatedAt: new Date() });
});

router.get("/on-duty", requireAuth, async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const onDuty = await db.select().from(dutyTable).where(and(eq(dutyTable.status, "on_duty"), eq(dutyTable.schoolId, schoolId)));
  const users = await Promise.all(
    onDuty.map(async (entry) => {
      const [user] = await db.select().from(usersTable).where(and(eq(usersTable.id, entry.userId), eq(usersTable.schoolId, schoolId)));
      if (!user) return null;
      const { passwordHash: _, ...rest } = user;
      return rest;
    })
  );
  // Alphabetisch nach Name: Dienst hat keine Rangfolge, eine stabile Liste
  // verhindert, dass derselbe Name je nach Datenbankreihenfolge mal oben,
  // mal unten auftaucht.
  const sorted = users
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .sort((a, b) => {
      const na = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim().toLowerCase();
      const nb = `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim().toLowerCase();
      return na.localeCompare(nb, "de");
    });
  res.json(sorted);
});

export default router;
