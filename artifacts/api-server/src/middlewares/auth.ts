import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

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

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
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
  req.user = payload;
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
