import { Router } from "express";
import bcrypt from "bcryptjs";
import { USERS, USERNAME_MAP } from "../data/store";
import { signToken, requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

function safeUser(u: (typeof USERS)[0]) {
  const { passwordHash: _, ...rest } = u;
  return rest;
}

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  if (!username) {
    res.status(400).json({ error: "username required" });
    return;
  }

  const key = username.toLowerCase().trim();
  const userId = USERNAME_MAP[key];
  const user = USERS.find((u) => u.id === userId);

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // For dev: accept any password if not set; in prod require bcrypt match
  const isValidPassword =
    !password || bcrypt.compareSync(password, user.passwordHash);

  if (!isValidPassword) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({ userId: user.id, role: user.role });
  const isTealUnlocked =
    key === "viktor.gnjatic" && password === "viktor.gnjatic";

  res.json({ token, user: safeUser(user), isTealUnlocked });
});

// POST /api/auth/logout
router.post("/logout", requireAuth, (_req, res) => {
  // In production: invalidate refresh token / session
  res.json({ message: "Logged out" });
});

// GET /api/auth/me
router.get("/me", requireAuth, (req: AuthRequest, res) => {
  const user = USERS.find((u) => u.id === req.user!.userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { passwordHash: _, ...rest } = user;
  res.json(rest);
});

export default router;
