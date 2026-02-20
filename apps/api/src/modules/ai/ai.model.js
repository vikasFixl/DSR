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
  // Tenant AI
  tenantOnboardingSuggestions: "tenant.onboarding-suggestions",
  tenantHealthScore: "tenant.health-score",
  tenantPlanUpgradeRecommendation: "tenant.plan-upgrade-recommendation",
  
  // User AI
  userDailySummary: "user.daily-summary",
  userProductivityFocus: "user.productivity-focus",
  userMeetingSummary: "user.meeting-summary",
  
  // Project AI
  projectDeadlineRisk: "project.deadline-risk",
  projectForecast: "project.forecast",
  projectScopeAnalysis: "project.scope-analysis",
  
  // Task AI
  taskBreakdown: "task.breakdown",
  taskAssigneeSuggestion: "task.assignee-suggestion",
  taskEffortEstimation: "task.effort-estimation",
  taskDuplicateDetection: "task.duplicate-detection",
  taskAutoTagging: "task.auto-tagging",
  taskDescriptionEnhancer: "task.description-enhancer",
  taskPriorityAdjustment: "task.priority-adjustment",
  
  // Reporting AI
  reportDSR: "report.dsr",
  reportWeekly: "report.weekly",
  reportMonthly: "report.monthly",
  reportYearly: "report.yearly",
  reportGenerateConfig: "report.generate-config",
  reportExecutiveSummary: "report.executive-summary",
  reportAnomalyDetection: "report.anomaly-detection",
  reportForecast: "report.forecast",
  
  // Dashboard AI
  dashboardSmartWidgets: "dashboard.smart-widgets",
  dashboardAnomalyDetection: "dashboard.anomaly-detection",
  dashboardWhatIfSimulation: "dashboard.what-if-simulation",
  
  // Integration AI
  integrationSyncConflictResolution: "integration.sync-conflict-resolution",
  integrationCommitToTaskMapping: "integration.commit-to-task-mapping",
  integrationPRRiskDetection: "integration.pr-risk-detection",
  integrationBugSeverityClassification: "integration.bug-severity-classification",
  
  // Security AI
  securityInsiderRisk: "security.insider-risk",
  securityPermissionAbuse: "security.permission-abuse",
  securityRoleOptimization: "security.role-optimization",
  securitySuspiciousSession: "security.suspicious-session",
  
  // Audit AI
  auditNaturalLanguageSearch: "audit.natural-language-search",
  auditRiskPatternDetection: "audit.risk-pattern-detection",
  
  // Document AI
  documentSummarization: "document.summarization",
  documentActionItemExtraction: "document.action-item-extraction",
  documentContractRiskDetection: "document.contract-risk-detection",
  
  // Chat Assistant AI
  chatWorkspaceAssistant: "chat.workspace-assistant",
  
  // Team AI
  teamPerformanceScore: "team.performance-score",
  teamBurnoutDetection: "team.burnout-detection",
  teamWorkloadBalancer: "team.workload-balancer",
  
  // Billing AI
  billingUsageAnalysis: "billing.usage-analysis",
  billingFraudDetection: "billing.fraud-detection",
  billingCostOptimization: "billing.cost-optimization",
  
  // DevOps AI
  devopsDeploymentRiskScoring: "devops.deployment-risk-scoring",
  devopsIncidentRootCause: "devops.incident-root-cause",
  devopsLogSummarization: "devops.log-summarization"
});
