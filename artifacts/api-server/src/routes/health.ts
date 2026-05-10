import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  try {
    await db.select({ count: 1 }).from(require("@workspace/db").usersTable).limit(1);
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  } catch {
    const data = HealthCheckResponse.parse({ status: "error" });
    res.status(503).json(data);
  }
});

export default router;
