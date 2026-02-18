/**
 * Audit routes. Admin read-only; role-based access.
 */

import { Router } from "express";
import { validate } from "#api/middlewares/validate.middleware.js";
import { authenticate } from "#api/middlewares/auth.middleware.js";
import { requireAdmin } from "#api/middlewares/requireAdmin.middleware.js";
import { listAuditSchema, getAuditSchema } from "#api/modules/audit/audit.validation.js";
import * as auditController from "#api/modules/audit/audit.controller.js";

/**
 * @param {{ auditController: typeof auditController }} deps
 * @returns {import("express").Router}
 */
export const createAuditRoutes = ({ auditController }) => {
  const router = Router();

  router.use(authenticate(), requireAdmin());

  router.get("/", validate(listAuditSchema), auditController.list);
  router.get("/:id", validate(getAuditSchema), auditController.getById);

  return router;
};
