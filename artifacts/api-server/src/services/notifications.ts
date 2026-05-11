import { randomUUID } from "crypto";
import { eq, and, or } from "drizzle-orm";
import { db, notificationsTable, deviceTokensTable, usersTable, type Notification, type NewNotification, type DeviceToken } from "@workspace/db";

export type NotificationType =
  | "mission_assigned"
  | "mission_cancelled"
  | "mission_completed"
  | "mission_created"
  | "status_changed"
  | "news"
  | "loa_update"
  | "reminder"
  | "high_priority_alert";

function uid(): string {
  return randomUUID();
}

export async function createNotification(data: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  priority?: "normal" | "high";
  relatedId?: string;
}): Promise<Notification> {
  const notification: NewNotification = {
    id: uid(),
    userId: data.userId,
    type: data.type,
    title: data.title,
    body: data.body,
    priority: data.priority ?? "normal",
    relatedId: data.relatedId ?? null,
    isRead: false,
    createdAt: new Date(),
  };

  const [created] = await db.insert(notificationsTable).values(notification).returning();
  
  await sendPushNotification(created);
  
  return created;
}

export async function createNotificationForMultipleUsers(userIds: string[], data: {
  type: NotificationType;
  title: string;
  body: string;
  priority?: "normal" | "high";
  relatedId?: string;
}): Promise<Notification[]> {
  const notifications: NewNotification[] = userIds.map((userId) => ({
    id: uid(),
    userId,
    type: data.type,
    title: data.title,
    body: data.body,
    priority: data.priority ?? "normal",
    relatedId: data.relatedId ?? null,
    isRead: false,
    createdAt: new Date(),
  }));

  const created = await db.insert(notificationsTable).values(notifications).returning();
  
  for (const notification of created) {
    sendPushNotification(notification).catch(console.error);
  }
  
  return created;
}

export async function notifySanitaeters(data: {
  type: NotificationType;
  title: string;
  body: string;
  priority?: "normal" | "high";
  relatedId?: string;
}): Promise<{ notifications: Notification[]; recipientCount: number }> {
  const sanitaeters = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      or(
        eq(usersTable.role, "sanitaeter_leitung"),
        eq(usersTable.role, "sanitaeter_leitung_admin"),
        eq(usersTable.role, "student_paramedic")
      )
    );

  const userIds = sanitaeters.map((u) => u.id);
  
  if (userIds.length === 0) {
    return { notifications: [], recipientCount: 0 };
  }

  const notifications = await createNotificationForMultipleUsers(userIds, data);
  return { notifications, recipientCount: userIds.length };
}

export async function notifyUser(userId: string, data: {
  type: NotificationType;
  title: string;
  body: string;
  priority?: "normal" | "high";
  relatedId?: string;
}): Promise<Notification | null> {
  try {
    const notification = await createNotification({
      userId,
      ...data,
    });
    return notification;
  } catch (err) {
    console.error("Failed to notify user:", err);
    return null;
  }
}

async function sendPushNotification(notification: Notification): Promise<void> {
  try {
    const tokens = await db
      .select()
      .from(deviceTokensTable)
      .where(eq(deviceTokensTable.userId, notification.userId));

    if (tokens.length === 0) {
      return;
    }

    const messages = tokens.map((token) => ({
      to: token.token,
      title: notification.title ?? getDefaultTitle(notification.type),
      body: notification.body,
      data: {
        notificationId: notification.id,
        type: notification.type,
        relatedId: notification.relatedId,
      },
      priority: notification.priority === "high" ? "high" : "default",
      channelId: notification.priority === "high" ? "high-priority" : "default",
      sound: notification.priority === "high" ? "default" : "default",
    }));

    await sendExpoPushMessages(messages);
  } catch (err) {
    console.error("Failed to send push notification:", err);
  }
}

function getDefaultTitle(type: NotificationType): string {
  const titles: Record<NotificationType, string> = {
    mission_assigned: "Neue Mission zugewiesen",
    mission_cancelled: "Mission abgesagt",
    mission_completed: "Mission abgeschlossen",
    mission_created: "Neue Mission",
    status_changed: "Status aktualisiert",
    news: "Neuigkeiten",
    loa_update: "Abwesenheitsantrag aktualisiert",
    reminder: "Erinnerung",
    high_priority_alert: "WICHTIG",
  };
  return titles[type] ?? "SchulSani";
}

async function sendExpoPushMessages(messages: any[]): Promise<void> {
  const EXPO_ACCESS_TOKEN = process.env["EXPO_ACCESS_TOKEN"];
  
  if (!EXPO_ACCESS_TOKEN) {
    console.log("[push] EXPO_ACCESS_TOKEN not configured, skipping push");
    return;
  }

  const chunks = [];
  const chunkSize = 100;
  
  for (let i = 0; i < messages.length; i += chunkSize) {
    chunks.push(messages.slice(i, i + chunkSize));
  }

  for (const chunk of chunks) {
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${EXPO_ACCESS_TOKEN}`,
        },
        body: JSON.stringify(chunk),
      });

      const result = await response.json();
      
      if (result.errors) {
        console.error("[push] Errors sending notifications:", result.errors);
      }
    } catch (err) {
      console.error("[push] Failed to send chunk:", err);
    }
  }
}

export async function saveDeviceToken(userId: string, token: string, platform: "ios" | "android" | "web", deviceId?: string): Promise<void> {
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) {
    throw new Error("Invalid token");
  }
  if (deviceId !== undefined && (typeof deviceId !== "string" || deviceId.length > 256)) {
    throw new Error("Invalid deviceId");
  }
  const existing = await db
    .select()
    .from(deviceTokensTable)
    .where(and(eq(deviceTokensTable.token, token), eq(deviceTokensTable.userId, userId)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(deviceTokensTable)
      .set({ updatedAt: new Date() })
      .where(eq(deviceTokensTable.id, existing[0].id));
  } else {
    await db.insert(deviceTokensTable).values({
      id: uid(),
      userId,
      token,
      platform,
      deviceId: deviceId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

export async function removeDeviceToken(token: string): Promise<void> {
  await db.delete(deviceTokensTable).where(eq(deviceTokensTable.token, token));
}
