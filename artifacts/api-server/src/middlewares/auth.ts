import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

const _jwtSecretRaw = process.env["JWT_SECRET"];
if (!_jwtSecretRaw || _jwtSecretRaw.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters");
}
const JWT_SECRET: string = _jwtSecretRaw;

export interface JwtPayload {
  userId: string;
  role: string;
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
  expires: number;
}

const USER_CACHE_TTL_MS = 60_000;
const userCache = new Map<string, LiveUser>();

export function invalidateUserCache(userId: string): void {
  userCache.delete(userId);
}

async function getLiveUser(userId: string): Promise<LiveUser | null> {
  const cached = userCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached;

  const rows = await db
    .select({ role: usersTable.role, isApproved: usersTable.isApproved })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    userCache.delete(userId);
    return null;
  }
  const entry: LiveUser = {
    role: row.role ?? "student_paramedic",
    isApproved: row.isApproved,
    expires: Date.now() + USER_CACHE_TTL_MS,
  };
  userCache.set(userId, entry);
  return entry;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const cookieToken = req.cookies?.["sani-token"];

  let token: string | undefined;

  if (header?.startsWith("Bearer ")) {
    token = header.slice(7);
  } else if (cookieToken) {
    token = cookieToken;
  }

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
  req.user = { userId: payload.userId, role: live.role };
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden – insufficient role" });
      return;
    }
    next();
  };
}
