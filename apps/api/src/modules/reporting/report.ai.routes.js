/**
 * Report AI Routes
 */

import express from "express";
import {
  generateDSRController,
  getLatestDSRController,
  generateWeeklyReportController,
  generateMonthlyReportController,
  generateYearlyReportController,
  getReportStatusController,
  getReportHistoryController,
  getReportController,
  exportReportController
} from "./report.ai.controller.js";
import { authenticate } from "#api/middlewares/auth.middleware.js";
import { validate } from "#api/middlewares/validate.middleware.js";
import { reportValidation } from "./report.validation.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// DSR routes
router.post("/dsr", validate(reportValidation.generateDSR), generateDSRController);
router.get("/dsr/latest", getLatestDSRController);

// Weekly report
router.post("/weekly", validate(reportValidation.generateWeekly), generateWeeklyReportController);

// Monthly report
router.post("/monthly", validate(reportValidation.generateMonthly), generateMonthlyReportController);

// Yearly report (Enterprise only)
router.post("/yearly", validate(reportValidation.generateYearly), generateYearlyReportController);

// Report status and history
router.get("/status/:jobId", getReportStatusController);
router.get("/history", getReportHistoryController);
router.get("/:reportId", getReportController);

// Export
router.post("/export/:reportId", validate(reportValidation.exportReport), exportReportController);

export default router;
