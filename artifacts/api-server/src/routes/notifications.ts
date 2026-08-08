import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth, schoolIdOf, type AuthRequest } from "../middlewares/auth";
import { saveDeviceToken, removeDeviceToken } from "../services/notifications";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const canSeeAll = (req.user!.permissions ?? []).includes("notifications.view_all");
  const items = canSeeAll
    ? await db.select().from(notificationsTable).where(eq(notificationsTable.schoolId, schoolId)).orderBy(desc(notificationsTable.createdAt))
    : await db.select().from(notificationsTable).where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.schoolId, schoolId))).orderBy(desc(notificationsTable.createdAt));
  res.json(items);
});

router.post("/read-all", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  await db.update(notificationsTable).set({ isRead: true }).where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.schoolId, schoolId)));
  res.json({ ok: true });
});

router.post("/register-device", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const { token, platform, deviceId } = req.body as { token: string; platform: "ios" | "android" | "web"; deviceId?: string };
  
  if (!token) {
    res.status(400).json({ error: "token is required" });
    return;
  }
  
  if (!["ios", "android", "web"].includes(platform)) {
    res.status(400).json({ error: "platform must be ios, android, or web" });
    return;
  }
  
  try {
    await saveDeviceToken(userId, schoolIdOf(req), token, platform, deviceId);
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to register device token:", err);
    res.status(500).json({ error: "Failed to register device" });
  }
});

router.post("/unregister-device", requireAuth, async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const { token } = req.body as { token: string };
  
  if (!token) {
    res.status(400).json({ error: "token is required" });
    return;
  }
  
  try {
    await removeDeviceToken(token, schoolId);
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to unregister device token:", err);
    res.status(500).json({ error: "Failed to unregister device" });
  }
});

export default router;
