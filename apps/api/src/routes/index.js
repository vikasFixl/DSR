import { Router } from "express";
import { createHealthRoutes } from "#api/modules/health/health.routes.js";
import { createAuthRoutes } from "#api/modules/auth/auth.routes.js";
import { createUserRoutes } from "#api/modules/user/user.routes.js";
import { createAuditRoutes } from "#api/modules/audit/audit.routes.js";
import { createNotificationRoutes } from "#api/modules/notification/notification.routes.js";

export const createRoutes = ({ controllers }) => {
  const router = Router();

  router.use("/health", createHealthRoutes({ healthController: controllers.healthController }));
  router.use("/auth", createAuthRoutes({ authController: controllers.authController }));
  router.use("/users", createUserRoutes({ userController: controllers.userController }));
  router.use("/audit", createAuditRoutes({ auditController: controllers.auditController }));
  router.use("/notifications", createNotificationRoutes({ notificationController: controllers.notificationController }));

  return router;
};
