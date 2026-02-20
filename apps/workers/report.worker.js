/**
 * Report Worker. Processes AI report generation jobs from BullMQ.
 */

import { Worker } from "bullmq";
import Redis from "redis";
import mongoose from "mongoose";
import { redisConfig } from "#api/config/redis.config.js";
import { dbConfig } from "#api/config/db.config.js";
import { generateDSR, generateWeeklyReport, generateMonthlyReport, generateYearlyReport } from "#api/modules/reporting/report.ai.service.js";
import AIReport from "#db/models/AIReport.model.js";
import {logger} from "#api/utils/logger.js";

// Connect to MongoDB
await mongoose.connect(dbConfig.uri, dbConfig.options);
logger.info("Report worker connected to MongoDB");

const redisConnection = Redis.createClient(redisConfig);

// Report generation worker
const reportWorker = new Worker(
  "ai-report-generation",
  async (job) => {
    const { type, tenantId, userId, params } = job.data;

    logger.info("Processing report job", { jobId: job.id, type, tenantId });

    try {
      // Create pending report
      const report = await AIReport.create({
        tenantId: mongoose.Types.ObjectId(tenantId),
        reportType: type,
        generatedBy: mongoose.Types.ObjectId(userId),
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
            tenantId: mongoose.Types.ObjectId(tenantId),
            userId: mongoose.Types.ObjectId(userId),
            date: params.date ? new Date(params.date) : new Date()
          });
          break;

        case "WEEKLY":
          result = await generateWeeklyReport({
            tenantId: mongoose.Types.ObjectId(tenantId),
            userId: mongoose.Types.ObjectId(userId),
            weekStart: new Date(params.weekStart)
          });
          break;

        case "MONTHLY":
          result = await generateMonthlyReport({
            tenantId: mongoose.Types.ObjectId(tenantId),
            userId: mongoose.Types.ObjectId(userId),
            monthStart: new Date(params.monthStart)
          });
          break;

        case "YEARLY":
          result = await generateYearlyReport({
            tenantId: mongoose.Types.ObjectId(tenantId),
            userId: mongoose.Types.ObjectId(userId),
            year: params.year
          });
          break;

        default:
          throw new Error(`Unknown report type: ${type}`);
      }

      // Delete the pending report (the service creates the final one)
      await AIReport.deleteOne({ _id: report._id });

      logger.info("Report job completed", { jobId: job.id, type, reportId: result._id });

      return { success: true, reportId: result._id };

    } catch (error) {
      logger.error("Report job failed", { jobId: job.id, type, error: error.message });

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
    connection: redisConnection,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 60000 // 10 jobs per minute
    }
  }
);

reportWorker.on("completed", (job) => {
  logger.info("Report worker job completed", { jobId: job.id });
});

reportWorker.on("failed", (job, err) => {
  logger.error("Report worker job failed", { jobId: job?.id, error: err.message });
});

logger.info("Report worker started");
