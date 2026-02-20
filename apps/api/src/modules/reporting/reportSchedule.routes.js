import { Router } from "express";
import { authenticate } from "#api/middlewares/auth.middleware.js";
import { requirePermission } from "#api/middlewares/requirePermission.js";
import { validate } from "#api/middlewares/validate.middleware.js";
import * as controller from "./reportSchedule.controller.js";
import * as validation from "./reportSchedule.validation.js";

const router = Router();

// All routes require authentication and tenantId
router.use(authenticate());

// GET /api/reports/schedules/upcoming
router.get(
  "/upcoming",
  requirePermission("reports.view"),
  validate(validation.upcomingSchedulesSchema),
  controller.getUpcomingSchedules
);

// POST /api/reports/schedules
router.post(
  "/",
  requirePermission("reports.schedule"),
  validate(validation.createScheduleSchema),
  controller.createSchedule
);

// PUT /api/reports/schedules/:scheduleId
router.put(
  "/:scheduleId",
  requirePermission("reports.schedule"),
  validate(validation.updateScheduleSchema),
  controller.updateSchedule
);

// PATCH /api/reports/schedules/:scheduleId/pause
router.patch(
  "/:scheduleId/pause",
  requirePermission("reports.schedule"),
  controller.pauseSchedule
);

// PATCH /api/reports/schedules/:scheduleId/resume
router.patch(
  "/:scheduleId/resume",
  requirePermission("reports.schedule"),
  controller.resumeSchedule
);

// DELETE /api/reports/schedules/:scheduleId
router.delete(
  "/:scheduleId",
  requirePermission("reports.delete"),
  controller.deleteSchedule
);

// GET /api/reports/schedules
router.get(
  "/",
  requirePermission("reports.view"),
  validate(validation.listSchedulesSchema),
  controller.listSchedules
);

// POST /api/reports/schedules/:scheduleId/run
router.post(
  "/:scheduleId/run",
  requirePermission("reports.run"),
  controller.runScheduleNow
);

export default router;
