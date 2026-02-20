/**
 * AI module constants and endpoint metadata.
 */

export const GEMINI_MODEL = "gemini-1.5-flash";

export const AI_JOB_QUEUES = Object.freeze({
  riskAnalysis: "ai-risk-analysis",
  forecast: "ai-forecast",
  summary: "ai-summary",
  reportGeneration: "ai-report-generation",
  securityMonitor: "ai-security-monitor"
});

export const AI_TYPES = Object.freeze({
  tenantOnboardingSuggestions: "tenant.onboarding-suggestions",
  tenantHealthScore: "tenant.health-score",
  tenantPlanUpgradeRecommendation: "tenant.plan-upgrade-recommendation",
  userDailySummary: "user.daily-summary",
  userProductivityFocus: "user.productivity-focus",
  userMeetingSummary: "user.meeting-summary",
  projectDeadlineRisk: "project.deadline-risk",
  projectForecast: "project.forecast",
  projectScopeAnalysis: "project.scope-analysis",
  taskBreakdown: "task.breakdown",
  taskAssigneeSuggestion: "task.assignee-suggestion",
  taskEffortEstimation: "task.effort-estimation",
  taskDuplicateDetection: "task.duplicate-detection",
  taskAutoTagging: "task.auto-tagging",
  reportGenerateConfig: "report.generate-config",
  reportExecutiveSummary: "report.executive-summary",
  reportAnomalyDetection: "report.anomaly-detection",
  securitySuspiciousActivity: "security.suspicious-activity",
  securityPermissionAbuse: "security.permission-abuse",
  securityInsiderRisk: "security.insider-risk",
  auditNaturalLanguageSearch: "audit.natural-language-search",
  auditRiskPatternDetection: "audit.risk-pattern-detection",
  billingUsageAnalysis: "billing.usage-analysis",
  billingFraudDetection: "billing.fraud-detection",
  billingCostOptimization: "billing.cost-optimization"
});
