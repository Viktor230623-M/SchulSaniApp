import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import newsRouter from "./news";
import loaRouter from "./loa";
import missionsRouter from "./missions";
import statusRouter from "./status";
import notificationsRouter from "./notifications";
import activityRouter from "./activity";
import incidentReportsRouter from "./incidentReports";
import rolesRouter from "./roles";
import rosterRouter from "./roster";
import dbConsoleRouter from "./dbConsole";
import exportsRouter from "./exports";
import cryptoRouter from "./crypto";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/news", newsRouter);
router.use("/loa", loaRouter);
router.use("/missions", missionsRouter);
router.use("/status", statusRouter);
router.use("/notifications", notificationsRouter);
router.use("/activity", activityRouter);
router.use("/incident-reports", incidentReportsRouter);
router.use("/roles", rolesRouter);
router.use("/roster", rosterRouter);
router.use("/db-console", dbConsoleRouter);
router.use("/exports", exportsRouter);
router.use("/crypto", cryptoRouter);

export default router;
