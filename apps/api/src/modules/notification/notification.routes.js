/**
 * Notification routes. User-scoped; no direct socket emission.
 */

import { Router } from "express";
import { validate } from "#api/middlewares/validate.middleware.js";
import { authenticate } from "#api/middlewares/auth.middleware.js";
import {
  listNotificationsSchema,
  getUnreadCountSchema,
  markAsReadSchema
} from "#api/modules/notification/notification.validation.js";
import * as notificationController from "#api/modules/notification/notification.controller.js";

/**
 * @param {{ notificationController: typeof notificationController }} deps
 * @returns {import("express").Router}
 */
export const createNotificationRoutes = ({ notificationController }) => {
  const router = Router();

  router.use(authenticate());

  router.get("/unread-count", validate(getUnreadCountSchema), notificationController.getUnreadCount);
  router.get("/", validate(listNotificationsSchema), notificationController.list);
  router.patch(
    "/:id/read",
    validate(markAsReadSchema),
    notificationController.markAsRead
  );

  return router;
};
