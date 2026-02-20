/**
 * Report Scheduler. Cron-based scheduler for automated report generation.
 */

import cron from "node-cron";
import Tenant from "#db/models/Tenant.model.js";
import User from "#db/models/User.model.js";
import { enqueueReportJob } from "./report.queue.service.js";
import {logger} from "#api/utils/logger.js";

/**
 * Schedule Daily Status Report (DSR) - Every day at 6 AM
 */
export function scheduleDSR() {
  cron.schedule("0 6 * * *", async () => {
    logger.info("Starting scheduled DSR generation for all tenants");

    try {
      const tenants = await Tenant.find({ status: "active" }).lean();

      for (const tenant of tenants) {
        // Get a user from the tenant (preferably admin)
        const user = await User.findOne({ tenantId: tenant._id }).lean();
        
        if (!user) {
          logger.warn("No user found for tenant", { tenantId: tenant._id });
          continue;
        }

        await enqueueReportJob({
          type: "DSR",
          tenantId: tenant._id,
          userId: user._id,
          params: { date: new Date() }
        });

        logger.info("DSR scheduled for tenant", { tenantId: tenant._id });
      }

      logger.info("DSR scheduling completed", { tenantsProcessed: tenants.length });
    } catch (error) {
      logger.error("DSR scheduling failed", { error: error.message });
    }
  });

  logger.info("DSR scheduler initialized (daily at 6 AM)");
}

/**
 * Schedule Weekly Team Report - Every Monday at 7 AM
 */
export function scheduleWeeklyReport() {
  cron.schedule("0 7 * * 1", async () => {
    logger.info("Starting scheduled weekly report generation");

    try {
      const tenants = await Tenant.find({
        status: "active",
        planId: { $exists: true }
      }).populate("planId").lean();

      for (const tenant of tenants) {
        // Check if plan allows weekly reports (Pro or Enterprise)
        if (!tenant.planId || tenant.planId.planCode === "free") {
          continue;
        }

        const user = await User.findOne({ tenantId: tenant._id }).lean();
        
        if (!user) continue;

        // Calculate week start (last Monday)
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);
        weekStart.setHours(0, 0, 0, 0);

        await enqueueReportJob({
          type: "WEEKLY",
          tenantId: tenant._id,
          userId: user._id,
          params: { weekStart }
        });

        logger.info("Weekly report scheduled for tenant", { tenantId: tenant._id });
      }
    } catch (error) {
      logger.error("Weekly report scheduling failed", { error: error.message });
    }
  });

  logger.info("Weekly report scheduler initialized (Mondays at 7 AM)");
}

/**
 * Schedule Monthly Performance Report - First day of month at 8 AM
 */
export function scheduleMonthlyReport() {
  cron.schedule("0 8 1 * *", async () => {
    logger.info("Starting scheduled monthly report generation");

    try {
      const tenants = await Tenant.find({
        status: "active",
        planId: { $exists: true }
      }).populate("planId").lean();

      for (const tenant of tenants) {
        // Check if plan allows monthly reports (Pro or Enterprise)
        if (!tenant.planId || tenant.planId.planCode === "free") {
          continue;
        }

        const user = await User.findOne({ tenantId: tenant._id }).lean();
        
        if (!user) continue;

        // Calculate last month start
        const monthStart = new Date();
        monthStart.setMonth(monthStart.getMonth() - 1);
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        await enqueueReportJob({
          type: "MONTHLY",
          tenantId: tenant._id,
          userId: user._id,
          params: { monthStart }
        });

        logger.info("Monthly report scheduled for tenant", { tenantId: tenant._id });
      }
    } catch (error) {
      logger.error("Monthly report scheduling failed", { error: error.message });
    }
  });

  logger.info("Monthly report scheduler initialized (1st of month at 8 AM)");
}

/**
 * Schedule Yearly Strategic Report - January 1st at 9 AM (Enterprise only)
 */
export function scheduleYearlyReport() {
  cron.schedule("0 9 1 1 *", async () => {
    logger.info("Starting scheduled yearly report generation");

    try {
      const tenants = await Tenant.find({
        status: "active",
        planId: { $exists: true }
      }).populate("planId").lean();

      for (const tenant of tenants) {
        // Enterprise only
        if (!tenant.planId || tenant.planId.planCode !== "enterprise") {
          continue;
        }

        const user = await User.findOne({ tenantId: tenant._id }).lean();
        
        if (!user) continue;

        const lastYear = new Date().getFullYear() - 1;

        await enqueueReportJob({
          type: "YEARLY",
          tenantId: tenant._id,
          userId: user._id,
          params: { year: lastYear }
        });

        logger.info("Yearly report scheduled for tenant", { tenantId: tenant._id, year: lastYear });
      }
    } catch (error) {
      logger.error("Yearly report scheduling failed", { error: error.message });
    }
  });

  logger.info("Yearly report scheduler initialized (Jan 1st at 9 AM)");
}

/**
 * Initialize all schedulers
 */
export function initializeReportSchedulers() {
  scheduleDSR();
  scheduleWeeklyReport();
  scheduleMonthlyReport();
  scheduleYearlyReport();
  
  logger.info("All report schedulers initialized");
}
