import { Router } from "express";
import { createHealthRoutes } from "#api/modules/health/health.routes.js";


export const createRoutes = ({ controllers }) => {
  const router = Router();

  router.use("/health", createHealthRoutes({ healthController: controllers.healthController }));
  

  return router;
};
