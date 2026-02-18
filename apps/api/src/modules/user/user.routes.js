import { Router } from "express";
import { validate } from "#api/middlewares/validate.middleware.js";
import { authenticate } from "#api/middlewares/auth.middleware.js";
import {
  getMeSchema,
  updateMeSchema,
  changePasswordSchema,
  getSessionsSchema,
  revokeSessionSchema
} from "#api/modules/user/user.validation.js";
import * as userController from "#api/modules/user/user.controller.js";

/**
 * @param {{ userController: typeof userController }} deps
 * @returns {import("express").Router}
 */
export const createUserRoutes = ({ userController }) => {
  const router = Router();

  router.use(authenticate());

  router.get("/me", validate(getMeSchema), userController.getMe);
  router.patch("/me", validate(updateMeSchema), userController.updateMe);
  router.post("/change-password", validate(changePasswordSchema), userController.changePassword);
  router.get("/sessions", validate(getSessionsSchema), userController.getSessions);
  router.delete("/sessions/:tokenId", validate(revokeSessionSchema), userController.revokeSession);

  return router;
};
