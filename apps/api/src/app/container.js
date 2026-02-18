import { HealthController } from "#api/modules/health/health.controller.js";
import * as authController from "#api/modules/auth/auth.controller.js";
import * as userController from "#api/modules/user/user.controller.js";

export const createContainer = () => {
  const healthController = new HealthController();

  return {
    controllers: {
      healthController,
      authController,
      userController
    }
  };
};
