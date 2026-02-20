/**
 * Report AI Controller. Handles HTTP requests for AI-powered reports.
 */

import { generateDSR, generateWeeklyReport, generateMonthlyReport, generateYearlyReport } from "./report.ai.service.js";
import { enqueueReportJob } from "./report.queue.service.js";
import AIReport from "#db/models/AIReport.model.js";
import { checkAIQuota } from "../ai/ai.service.js";
import {ApiError }from "#api/utils/ApiError.js";
import {logger} from "#api/utils/logger.js";

/**
 * POST /api/ai/report/dsr
 * Generate Daily Status Report
 */
export async function generateDSRController(req, res, next) {
  try {
    const { tenantId, userId } = req.user;
    const { date } = req.body;

    // Check AI quota
    const quota = await checkAIQuota(tenantId, req.user.planLimits);
    if (!quota.allowed) {
      throw new ApiError(429, "AI quota exceeded for this month");
    }

    // Enqueue job for async processing
    const jobId = await enqueueReportJob({
      type: "DSR",
      tenantId,
      userId,
      params: { date: date ? new Date(date) : new Date() }
    });

    res.status(202).json({
      success: true,
      message: "DSR generation started",
      jobId,
      estimatedTime: "30-60 seconds"
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/ai/report/dsr/latest
 * Get latest DSR
 */
export async function getLatestDSRController(req, res, next) {
  try {
    const { tenantId } = req.user;

    const report = await AIReport.findOne({
      tenantId,
      reportType: "DSR",
      status: "completed"
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!report) {
      throw new ApiError(404, "No DSR found");
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/ai/report/weekly
 * Generate Weekly Team Report
 */
export async function generateWeeklyReportController(req, res, next) {
  try {
    const { tenantId, userId, planLimits } = req.user;
    const { weekStart } = req.body;

    // Check plan restrictions
    if (planLimits.planCode === "free") {
      throw new ApiError(403, "Weekly reports require Pro or Enterprise plan");
    }

    // Check AI quota
    const quota = await checkAIQuota(tenantId, planLimits);
    if (!quota.allowed) {
      throw new ApiError(429, "AI quota exceeded for this month");
    }

    const jobId = await enqueueReportJob({
      type: "WEEKLY",
      tenantId,
      userId,
      params: { weekStart: new Date(weekStart) }
    });

    res.status(202).json({
      success: true,
      message: "Weekly report generation started",
      jobId,
      estimatedTime: "1-2 minutes"
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/ai/report/monthly
 * Generate Monthly Performance Report
 */
export async function generateMonthlyReportController(req, res, next) {
  try {
    const { tenantId, userId, planLimits } = req.user;
    const { monthStart } = req.body;

    // Check plan restrictions
    if (planLimits.planCode === "free") {
      throw new ApiError(403, "Monthly reports require Pro or Enterprise plan");
    }

    // Check AI quota
    const quota = await checkAIQuota(tenantId, planLimits);
    if (!quota.allowed) {
      throw new ApiError(429, "AI quota exceeded for this month");
    }

    const jobId = await enqueueReportJob({
      type: "MONTHLY",
      tenantId,
      userId,
      params: { monthStart: new Date(monthStart) }
    });

    res.status(202).json({
      success: true,
      message: "Monthly report generation started",
      jobId,
      estimatedTime: "2-3 minutes"
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/ai/report/yearly
 * Generate Yearly Strategic Intelligence Report (Enterprise only)
 */
export async function generateYearlyReportController(req, res, next) {
  try {
    const { tenantId, userId, planLimits } = req.user;
    const { year } = req.body;

    // Check plan restrictions - Enterprise only
    if (planLimits.planCode !== "enterprise") {
      throw new ApiError(403, "Yearly strategic reports require Enterprise plan");
    }

    // Check AI quota
    const quota = await checkAIQuota(tenantId, planLimits);
    if (!quota.allowed) {
      throw new ApiError(429, "AI quota exceeded for this month");
    }

    const jobId = await enqueueReportJob({
      type: "YEARLY",
      tenantId,
      userId,
      params: { year: parseInt(year) }
    });

    res.status(202).json({
      success: true,
      message: "Yearly strategic report generation started",
      jobId,
      estimatedTime: "5-10 minutes"
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/ai/report/status/:jobId
 * Check report generation status
 */
export async function getReportStatusController(req, res, next) {
  try {
    const { tenantId } = req.user;
    const { jobId } = req.params;

    const report = await AIReport.findOne({
      tenantId,
      jobId
    }).lean();

    if (!report) {
      throw new ApiError(404, "Report not found");
    }

    res.json({
      success: true,
      data: {
        status: report.status,
        reportId: report._id,
        reportType: report.reportType,
        completedAt: report.completedAt,
        errorMessage: report.errorMessage
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/ai/report/history
 * Get report history
 */
export async function getReportHistoryController(req, res, next) {
  try {
    const { tenantId } = req.user;
    const { reportType, limit = 20, page = 1 } = req.query;

    const query = { tenantId, status: "completed" };
    if (reportType) {
      query.reportType = reportType;
    }

    const reports = await AIReport.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    const total = await AIReport.countDocuments(query);

    res.json({
      success: true,
      data: reports,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/ai/report/:reportId
 * Get specific report
 */
export async function getReportController(req, res, next) {
  try {
    const { tenantId } = req.user;
    const { reportId } = req.params;

    const report = await AIReport.findOne({
      tenantId,
      _id: reportId
    }).lean();

    if (!report) {
      throw new ApiError(404, "Report not found");
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/ai/report/export/:reportId
 * Export report to PDF/CSV/JSON
 */
export async function exportReportController(req, res, next) {
  try {
    const { tenantId } = req.user;
    const { reportId } = req.params;
    const { format = "JSON" } = req.body;

    if (!["PDF", "CSV", "JSON"].includes(format)) {
      throw new ApiError(400, "Invalid format. Must be PDF, CSV, or JSON");
    }

    const report = await AIReport.findOne({
      tenantId,
      _id: reportId,
      status: "completed"
    });

    if (!report) {
      throw new ApiError(404, "Report not found");
    }

    // Check if already exported
    const existingExport = report.exports.find(e => e.format === format);
    if (existingExport) {
      return res.json({
        success: true,
        data: {
          format,
          url: existingExport.fileUrl,
          generatedAt: existingExport.generatedAt
        }
      });
    }

    // Enqueue export job
    const jobId = await enqueueReportJob({
      type: "EXPORT",
      tenantId,
      userId: req.user.userId,
      params: { reportId, format }
    });

    res.status(202).json({
      success: true,
      message: "Export started",
      jobId
    });
  } catch (error) {
    next(error);
  }
}
