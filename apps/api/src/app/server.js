import { app } from "#api/app/app.js";
import { config } from "#api/config/env.js";
import { dbConfig } from "#api/config/db.config.js";
import { redisConfig } from "#api/config/redis.config.js";
import { logger } from "#api/utils/logger.js";
import { connectMongo, disconnectMongo } from "#db/connection/mongoose.js";
import { connectRedis, disconnectRedis, getRedisClient } from "#infra/cache/redis.js";
import { createEmailQueue, closeEmailQueue } from "#infra/queue/email.queue.js";
import { initializeReportSchedulers } from "#api/modules/reporting/report.scheduler.js";

let server;
let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutdown signal received");

  const closeServer = () =>
    new Promise((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });

  await Promise.allSettled([closeServer(), closeEmailQueue(), disconnectRedis(), disconnectMongo()]);
  logger.info("Graceful shutdown complete");
  process.exit(0);
};

const startServer = async () => {
  await connectMongo(dbConfig);
  await connectRedis({ url: redisConfig.url, socket: redisConfig.socket });

  createEmailQueue({
    redisClient: getRedisClient(),
    connection: redisConfig.bullmqConnection
  });

  // Initialize AI report schedulers
  initializeReportSchedulers();

  server = app.listen(config.app.port, () => {
    logger.info(
      {
        service: config.app.name,
        port: config.app.port,
        env: config.app.env
      },
      "API server started"
    );
  });

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });
};

startServer().catch(async (error) => {
  logger.error({ err: error }, "Failed to start server");
  await Promise.allSettled([closeEmailQueue(), disconnectRedis(), disconnectMongo()]);
  process.exit(1);
});
