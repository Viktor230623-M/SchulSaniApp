import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import newsRouter from "./news";
import loaRouter from "./loa";
import missionsRouter from "./missions";
import statusRouter from "./status";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/news", newsRouter);
router.use("/loa", loaRouter);
router.use("/missions", missionsRouter);
router.use("/status", statusRouter);
router.use("/notifications", notificationsRouter);

export default router;
