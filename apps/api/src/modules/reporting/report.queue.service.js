/**
 * Report Queue Service. Handles BullMQ job enqueueing for heavy AI report processing.
 */

import { Queue } from "bullmq";
import Redis from "redis";
import { redisConfig } from "#api/config/redis.config.js";
import {logger} from "#api/utils/logger.js";

const redisConnection = Redis.createClient(redisConfig);

// Create queues
export const reportQueue = new Queue("ai-report-generation", {
  connection: redisConnection
});

export const exportQueue = new Queue("ai-report-export", {
  connection: redisConnection
});

/**
 * Enqueue report generation job
 */
export async function enqueueReportJob({ type, tenantId, userId, params }) {
  const jobData = {
    type,
    tenantId: tenantId.toString(),
    userId: userId.toString(),
    params
  };

  const job = await reportQueue.add(`generate-${type.toLowerCase()}`, jobData, {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000
    },
    removeOnComplete: 100,
    removeOnFail: 50
  });

  logger.info("Report job enqueued", { jobId: job.id, type, tenantId });

  return job.id;
}

/**
 * Enqueue export job
 */
export async function enqueueExportJob({ reportId, format, tenantId, userId }) {
  const jobData = {
    reportId: reportId.toString(),
    format,
    tenantId: tenantId.toString(),
    userId: userId.toString()
  };

  const job = await exportQueue.add(`export-${format.toLowerCase()}`, jobData, {
    attempts: 2,
    backoff: {
      type: "fixed",
      delay: 3000
    },
    removeOnComplete: 50,
    removeOnFail: 20
  });

  logger.info("Export job enqueued", { jobId: job.id, reportId, format });

  return job.id;
}
