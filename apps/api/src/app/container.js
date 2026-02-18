
import { HealthController } from "#api/modules/health/health.controller.js";

export const createContainer = () => {

  const healthController = new HealthController();

  return {
    
    controllers: {
   
      healthController
    }
  };
};
