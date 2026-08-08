import { Router } from "express";
import { and, eq, desc, sql } from "drizzle-orm";
import { db, usersTable, missionActivityLogTable } from "@workspace/db";
import { requireAuth, requirePermission, schoolIdOf, type AuthRequest } from "../middlewares/auth";

const router = Router();

// GET /activity/users - returns all users with their activity count and last activity
router.get("/users", requireAuth, requirePermission("activity.view"), async (req: AuthRequest, res) => {
  try {
    const schoolId = schoolIdOf(req);
    const users = await db.select().from(usersTable).where(eq(usersTable.schoolId, schoolId));

    // Get activity counts and last activity for each user
    const activityCounts = await db
      .select({
        userId: missionActivityLogTable.userId,
        activityCount: sql<number>`count(*)::int`,
        lastActivity: sql<string>`max(${missionActivityLogTable.createdAt})`,
      })
      .from(missionActivityLogTable)
      .where(eq(missionActivityLogTable.schoolId, schoolId))
      .groupBy(missionActivityLogTable.userId);

    const activityMap = new Map(activityCounts.map(a => [a.userId, a]));

    // Combine user data with activity data
    const result = users.map(user => {
      const activityData = activityMap.get(user.id);
      const firstName = user.firstName || "";
      const lastName = user.lastName || "";
      const fullName = `${firstName} ${lastName}`.trim() || user.id;
      return {
        userId: user.id,
        userName: fullName,
        firstName,
        lastName,
        role: user.role,
        activityCount: activityData?.activityCount || 0,
        lastActivity: activityData?.lastActivity || null,
      };
    });

    // Sort by activity count descending
    result.sort((a, b) => b.activityCount - a.activityCount);

    res.json(result);
  } catch (err) {
    console.error("Failed to get activity users:", err);
    res.status(500).json({ error: "Failed to load activity users" });
  }
});

// GET /activity/my - returns activities for the current user
router.get("/my", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const schoolId = schoolIdOf(req);

    const activities = await db
      .select()
      .from(missionActivityLogTable)
      .where(and(eq(missionActivityLogTable.userId, userId), eq(missionActivityLogTable.schoolId, schoolId)))
      .orderBy(desc(missionActivityLogTable.createdAt));

    res.json(activities);
  } catch (err) {
    console.error("Failed to get my activity:", err);
    res.status(500).json({ error: "Failed to load activities" });
  }
});

// GET /activity/user/:userId - returns activities for a specific user
router.get("/user/:userId", requireAuth, requirePermission("activity.view"), async (req: AuthRequest, res) => {
  try {
    const userId = req.params.userId as string;
    const schoolId = schoolIdOf(req);

    const [user] = await db.select().from(usersTable).where(and(eq(usersTable.id, userId), eq(usersTable.schoolId, schoolId)));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const activities = await db
      .select()
      .from(missionActivityLogTable)
      .where(and(eq(missionActivityLogTable.userId, userId), eq(missionActivityLogTable.schoolId, schoolId)))
      .orderBy(desc(missionActivityLogTable.createdAt));

    res.json(activities);
  } catch (err) {
    console.error("Failed to get user activity:", err);
    res.status(500).json({ error: "Failed to load user activities" });
  }
});

export default router;
