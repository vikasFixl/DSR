import { Router } from "express";
import { authenticate } from "#api/middlewares/auth.middleware.js";
import { requirePermission } from "#api/middlewares/requirePermission.js";
import { validate } from "#api/middlewares/validate.middleware.js";
import * as controller from "./reportTemplate.controller.js";
import * as validation from "./reportTemplate.validation.js";

const router = Router();

// All routes require authentication and tenantId
router.use(authenticate());

// POST /api/reports/templates
router.post(
  "/",
  requirePermission("reports.create"),
  validate(validation.createTemplateSchema),
  controller.createTemplate
);

// PUT /api/reports/templates/:templateId
router.put(
  "/:templateId",
  requirePermission("reports.edit"),
  validate(validation.updateTemplateSchema),
  controller.updateTemplate
);

// GET /api/reports/templates/:templateId
router.get(
  "/:templateId",
  requirePermission("reports.view"),
  controller.getTemplate
);

// GET /api/reports/templates
router.get(
  "/",
  requirePermission("reports.view"),
  validate(validation.listTemplatesSchema),
  controller.listTemplates
);

// DELETE /api/reports/templates/:templateId
router.delete(
  "/:templateId",
  requirePermission("reports.delete"),
  controller.deleteTemplate
);

// PATCH /api/reports/templates/:templateId/status
router.patch(
  "/:templateId/status",
  requirePermission("reports.edit"),
  validate(validation.updateTemplateStatusSchema),
  controller.updateTemplateStatus
);

// POST /api/reports/templates/:templateId/clone
router.post(
  "/:templateId/clone",
  requirePermission("reports.create"),
  controller.cloneTemplate
);

export default router;
