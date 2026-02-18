import { Router } from "express";
import { createHealthRoutes } from "#api/modules/health/health.routes.js";
import { createAuthRoutes } from "#api/modules/auth/auth.routes.js";
import { createUserRoutes } from "#api/modules/user/user.routes.js";

export const createRoutes = ({ controllers }) => {
  const router = Router();

  router.use("/health", createHealthRoutes({ healthController: controllers.healthController }));
  router.use("/auth", createAuthRoutes({ authController: controllers.authController }));
  router.use("/users", createUserRoutes({ userController: controllers.userController }));

  return router;
};
