/**
 * Tenant routes. Create/get/update/suspend tenant and settings; membership nested under :tenantId.
 */

import { Router } from "express";
import { validate } from "#api/middlewares/validate.middleware.js";
import { authenticate } from "#api/middlewares/auth.middleware.js";
import {
  createTenantSchema,
  getTenantSchema,
  updateTenantSchema,
  deleteTenantSchema,
  getSettingsSchema,
  updateSettingsSchema,
} from "#api/modules/tenant/tenant.validation.js";
import {
  requireTenantMembership,
  requireTenantOwner,
} from "#api/middlewares/requireTenantMembership.js";
import { createMembershipRoutes } from "#api/modules/membership/membership.routes.js";
import * as tenantController from "#api/modules/tenant/tenant.controller.js";

/**
 * @param {{ tenantController: typeof tenantController, membershipController: import("#api/modules/membership/membership.controller.js") }} deps
 * @returns {import("express").Router}
 */
export const createTenantRoutes = ({ tenantController, membershipController }) => {
  const router = Router();

  router.use(authenticate());

  router.post("/", validate(createTenantSchema), tenantController.createTenant);

  router.get(
    "/:tenantId",
    validate(getTenantSchema),
    requireTenantMembership(),
    tenantController.getTenant
  );

  router.patch(
    "/:tenantId",
    validate(updateTenantSchema),
    requireTenantMembership(),
    requireTenantOwner(),
    tenantController.updateTenant
  );

  router.delete(
    "/:tenantId",
    validate(deleteTenantSchema),
    requireTenantMembership(),
    requireTenantOwner(),
    tenantController.deleteTenant
  );

  router.get(
    "/:tenantId/settings",
    validate(getSettingsSchema),
    requireTenantMembership(),
    tenantController.getSettings
  );

  router.patch(
    "/:tenantId/settings",
    validate(updateSettingsSchema),
    requireTenantMembership(),
    requireTenantOwner(),
    tenantController.updateSettings
  );

  router.use("/:tenantId", createMembershipRoutes({ membershipController }));

  return router;
};
