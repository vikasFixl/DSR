import { HealthController } from "#api/modules/health/health.controller.js";
import * as authController from "#api/modules/auth/auth.controller.js";
import * as userController from "#api/modules/user/user.controller.js";
import * as auditController from "#api/modules/audit/audit.controller.js";
import * as notificationController from "#api/modules/notification/notification.controller.js";
import * as billingController from "#api/modules/billing/billing.controller.js";
import * as tenantController from "#api/modules/tenant/tenant.controller.js";
import * as membershipController from "#api/modules/membership/membership.controller.js";

export const createContainer = () => {
  const healthController = new HealthController();

  return {
    controllers: {
      healthController,
      authController,
      userController,
      auditController,
      notificationController,
      billingController,
      tenantController,
      membershipController,
    },
  };
};
