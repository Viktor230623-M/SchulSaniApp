import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth, schoolIdOf, type AuthRequest } from "../middlewares/auth";
import { saveDeviceToken, removeDeviceToken } from "../services/notifications";
import { z } from "@workspace/api-zod";
import { validate } from "../middlewares/validate";

const router = Router();

const registerDeviceBody = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(["ios", "android", "web"]),
  deviceId: z.string().max(512).nullish(),
});

const unregisterDeviceBody = z.object({
  token: z.string().min(1).max(4096),
});

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

router.post("/register-device", requireAuth, validate({ body: registerDeviceBody }), async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const { token, platform, deviceId } = req.body as { token: string; platform: "ios" | "android" | "web"; deviceId?: string };
  
  try {
    await saveDeviceToken(userId, schoolIdOf(req), token, platform, deviceId);
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to register device token:", err);
    res.status(500).json({ error: "Failed to register device" });
  }
});

router.post("/unregister-device", requireAuth, validate({ body: unregisterDeviceBody }), async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const { token } = req.body as { token: string };
  
  try {
    await removeDeviceToken(token, schoolId, req.user!.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to unregister device token:", err);
    res.status(500).json({ error: "Failed to unregister device" });
  }
});

export default router;
