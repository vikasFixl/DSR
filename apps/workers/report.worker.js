/**
 * Report Worker. Processes both AI report generation and standard report generation jobs from BullMQ.
 */

import { Worker } from "bullmq";
import mongoose from "mongoose";
import { redisConfig } from "#api/config/redis.config.js";
import { dbConfig } from "#api/config/db.config.js";
import { connectRedis } from "#infra/cache/redis.js";
import { generateDSR, generateWeeklyReport, generateMonthlyReport, generateYearlyReport } from "#api/modules/reporting/report.ai.service.js";
import { startReportWorker } from "#api/modules/reporting/reportQueue.worker.js";
import { startScheduler } from "#api/modules/reporting/reportScheduler.worker.js";
import AIReport from "#db/models/AIReport.model.js";
import { logger } from "#api/utils/logger.js";

// Connect to MongoDB
await mongoose.connect(dbConfig.uri, dbConfig.options);
logger.info("Report worker connected to MongoDB");

// Connect to Redis
await connectRedis(redisConfig);
logger.info("Report worker connected to Redis");

// ============================================================================
// AI Report Generation Worker (Legacy)
// ============================================================================

const aiReportWorker = new Worker(
  "ai-report-generation",
  async (job) => {
    const { type, tenantId, userId, params } = job.data;

    logger.info({ jobId: job.id, type, tenantId }, "Processing AI report job");

    try {
      // Create pending report
      const report = await AIReport.create({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        reportType: type,
        generatedBy: new mongoose.Types.ObjectId(userId),
        status: "processing",
        period: {
          start: params.date || params.weekStart || params.monthStart || new Date(params.year, 0, 1),
          end: params.date || params.weekStart || params.monthStart || new Date(params.year + 1, 0, 1)
        },
        jobId: job.id
      });

      let result;

      switch (type) {
        case "DSR":
          result = await generateDSR({
            tenantId: new mongoose.Types.ObjectId(tenantId),
            userId: new mongoose.Types.ObjectId(userId),
            date: params.date ? new Date(params.date) : new Date()
          });
          break;

        case "WEEKLY":
          result = await generateWeeklyReport({
            tenantId: new mongoose.Types.ObjectId(tenantId),
            userId: new mongoose.Types.ObjectId(userId),
            weekStart: new Date(params.weekStart)
          });
          break;

        case "MONTHLY":
          result = await generateMonthlyReport({
            tenantId: new mongoose.Types.ObjectId(tenantId),
            userId: new mongoose.Types.ObjectId(userId),
            monthStart: new Date(params.monthStart)
          });
          break;

        case "YEARLY":
          result = await generateYearlyReport({
            tenantId: new mongoose.Types.ObjectId(tenantId),
            userId: new mongoose.Types.ObjectId(userId),
            year: params.year
          });
          break;

        default:
          throw new Error(`Unknown report type: ${type}`);
      }

      // Delete the pending report (the service creates the final one)
      await AIReport.deleteOne({ _id: report._id });

      logger.info({ jobId: job.id, type, reportId: result._id }, "AI report job completed");

      return { success: true, reportId: result._id };

    } catch (error) {
      logger.error({ jobId: job.id, type, error: error.message }, "AI report job failed");

      // Update report status to failed
      await AIReport.findOneAndUpdate(
        { jobId: job.id },
        {
          status: "failed",
          errorMessage: error.message
        }
      );

      throw error;
    }
  },
  {
    connection: redisConfig.bullmqConnection,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 60000 // 10 jobs per minute
    }
  }
);

aiReportWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "AI report worker job completed");
});

aiReportWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, "AI report worker job failed");
});

logger.info("AI report worker started");

// ============================================================================
// Standard Report Generation Worker (New Reporting Engine)
// ============================================================================

const reportWorker = startReportWorker();
logger.info("Standard report worker started");

// ============================================================================
// Report Scheduler (Runs every minute)
// ============================================================================

startScheduler(60000);
logger.info("Report scheduler started (runs every 60 seconds)");

// ============================================================================
// Graceful Shutdown
// ============================================================================

const shutdown = async () => {
  logger.info("Shutting down report workers...");
  
  try {
    await Promise.all([
      aiReportWorker.close(),
      reportWorker.close()
    ]);
    
    await mongoose.connection.close();
    logger.info("Report workers shut down successfully");
    process.exit(0);
  } catch (error) {
    logger.error({ error: error.message }, "Error during shutdown");
    process.exit(1);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

logger.info("All report workers and scheduler initialized successfully");
