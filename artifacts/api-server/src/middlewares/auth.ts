import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { permissionsForRole } from "../lib/rolePermissions";

const _jwtSecretRaw = process.env["JWT_SECRET"];
if (!_jwtSecretRaw || _jwtSecretRaw.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters");
}
const JWT_SECRET: string = _jwtSecretRaw;

export interface JwtPayload {
  userId: string;
  role: string;
  permissions?: string[];
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as unknown as JwtPayload;
  } catch {
    return null;
  }
}

// Tokens are valid for 24h, so the role/approval inside them can go stale.
// Re-check the user against the DB (cached briefly) so demoted, un-approved
// or deleted users lose access immediately instead of at token expiry.
interface LiveUser {
  role: string;
  isApproved: boolean;
  permissions: string[];
  expires: number;
}

const USER_CACHE_TTL_MS = 60_000;
const userCache = new Map<string, LiveUser>();

export function invalidateUserCache(userId: string): void {
  userCache.delete(userId);
}

export function invalidateRoleCache(roleKey: string): void {
  for (const [userId, entry] of userCache.entries()) {
    if (entry.role === roleKey) userCache.delete(userId);
  }
}

export function invalidateAllRoleCaches(): void {
  userCache.clear();
}

async function getLiveUser(userId: string): Promise<LiveUser | null> {
  const cached = userCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached;

  const rows = await db
    .select({ role: usersTable.role, isApproved: usersTable.isApproved, schoolId: usersTable.schoolId })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    userCache.delete(userId);
    return null;
  }
  const role = row.role ?? "sanitaeter";
  // Bereich ist die Schule der Nutzerzeile -- derselbe Bereich, in dem
  // routes/roles.ts die Berechtigungen dieser Rolle pflegt.
  const entry: LiveUser = {
    role,
    isApproved: row.isApproved,
    permissions: await permissionsForRole(role, row.schoolId),
    expires: Date.now() + USER_CACHE_TTL_MS,
  };
  userCache.set(userId, entry);
  return entry;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  // Bewusst nur Bearer. Wuerde hier zusaetzlich ein Cookie akzeptiert, waere jede
  // zustandsaendernde Route cookie-getragen und damit CSRF-relevant. Das
  // Sitzungscookie gilt ausschliesslich an GET /auth/session.
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  let live: LiveUser | null;
  try {
    live = await getLiveUser(payload.userId);
  } catch (err) {
    console.error("Auth user lookup failed:", err);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
  if (!live || !live.isApproved) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  // Ein lokales Konto mit noch nicht gewechseltem Einmal-Passwort bekommt hier
  // keine nutzbare Sitzung fuer andere Routen -- einzige Ausnahme ist der
  // Passwortwechsel selbst (routes/auth.ts, prueft Bearer und Kontostand
  // eigenstaendig, ohne ueber requireAuth zu laufen).
  if (live.mustChangePassword) {
    res.status(403).json({ error: "Passwortwechsel erforderlich", code: "PASSWORD_CHANGE_REQUIRED" });
    return;
  }
  req.user = { userId: payload.userId, role: live.role, permissions: live.permissions };
  next();
}

import { type PermissionKey } from "../lib/permissions";

export function requirePermission(...perms: PermissionKey[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(403).json({ error: "Forbidden" }); return; }
    // Quelle ist die Datenbank, aufgeloest in requireAuth und dort
    // zwischengespeichert.
    const rolePerms: readonly string[] = req.user.permissions ?? [];
    const ok = perms.every((p) => rolePerms.includes(p));
    if (!ok) { res.status(403).json({ error: "Forbidden - missing permission" }); return; }
    next();
  };
}
