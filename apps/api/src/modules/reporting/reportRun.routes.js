import { Router } from "express";
import { authenticate } from "#api/middlewares/auth.middleware.js";
import { requirePermission } from "#api/middlewares/requirePermission.js";
import { validate } from "#api/middlewares/validate.middleware.js";
import * as controller from "./reportRun.controller.js";
import * as validation from "./reportRun.validation.js";

const router = Router();

// All routes require authentication and tenantId
router.use(authenticate());

// POST /api/reports/templates/:templateId/run
router.post(
  "/templates/:templateId/run",
  requirePermission("reports.run"),
  validate(validation.runTemplateSchema),
  controller.runTemplate
);

// GET /api/reports/runs
router.get(
  "/runs",
  requirePermission("reports.view"),
  validate(validation.listRunsSchema),
  controller.listRuns
);

// GET /api/reports/runs/:runId
router.get(
  "/runs/:runId",
  requirePermission("reports.view"),
  controller.getRun
);

// POST /api/reports/runs/:runId/retry
router.post(
  "/runs/:runId/retry",
  requirePermission("reports.run"),
  controller.retryRun
);

// DELETE /api/reports/runs/:runId
router.delete(
  "/runs/:runId",
  requirePermission("reports.delete"),
  controller.deleteRun
);

// GET /api/reports/runs/:runId/download
router.get(
  "/runs/:runId/download",
  requirePermission("reports.export"),
  controller.downloadRun
);

// GET /api/reports/stats
router.get(
  "/stats",
  requirePermission("reports.view"),
  controller.getStats
);

export default router;
