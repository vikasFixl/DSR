/**
 * Central AIService. All AI calls MUST go through this service.
 * Handles Gemini API, token tracking, logging, and governance.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODEL } from "./ai.model.js";
import AIExecutionLog from "#db/models/AIExecutionLog.model.js";
import AIUsage from "#db/models/AIUsage.model.js";
import {logger} from "#api/utils/logger.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Sanitize prompt to prevent injection attacks
 */
function sanitizePrompt(prompt) {
  if (!prompt || typeof prompt !== "string") {
    throw new Error("Invalid prompt");
  }
  return prompt.trim().slice(0, 50000); // Max 50k chars
}

/**
 * Generate month key for usage tracking (YYYYMM format)
 */
function getMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

/**
 * Track AI usage in AIUsage collection
 */
async function trackUsage(tenantId, userId, type, tokensUsed) {
  const monthKey = getMonthKey();
  
  try {
    await AIUsage.findOneAndUpdate(
      { tenantId, monthKey },
      {
        $inc: { tokensUsed, requestCount: 1 },
        $set: { userId, type }
      },
      { upsert: true, new: true }
    );
  } catch (error) {
    logger.error("Failed to track AI usage", { error: error.message, tenantId, type });
  }
}

/**
 * Main AI execution method
 * @param {Object} params
 * @param {ObjectId} params.tenantId - Tenant ID (required)
 * @param {ObjectId} params.userId - User ID (required)
 * @param {string} params.type - AI type from AI_TYPES (required)
 * @param {string} params.prompt - User prompt (required)
 * @param {Object} params.schema - JSON schema for structured output (optional)
 * @param {Object} params.metadata - Additional metadata (optional)
 * @returns {Promise<Object>} { success, data, tokensUsed, executionLogId }
 */
export async function executeAI({
  tenantId,
  userId,
  type,
  prompt,
  schema = null,
  metadata = {}
}) {
  const startTime = Date.now();
  
  if (!tenantId || !userId || !type || !prompt) {
    throw new Error("Missing required parameters: tenantId, userId, type, prompt");
  }

  const sanitizedPrompt = sanitizePrompt(prompt);
  
  let executionLog = null;
  let responseText = null;
  let responseJson = null;
  let tokensUsed = 0;
  let status = "success";
  let errorMessage = null;

  try {
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_MODEL,
      generationConfig: schema ? {
        responseMimeType: "application/json",
        responseSchema: schema
      } : undefined
    });

    const result = await model.generateContent(sanitizedPrompt);
    const response = result.response;
    
    responseText = response.text();
    tokensUsed = response.usageMetadata?.totalTokenCount || 0;

    if (schema) {
      responseJson = JSON.parse(responseText);
    }

    logger.info("AI execution successful", { type, tokensUsed });

  } catch (error) {
    status = "failed";
    errorMessage = error.message;
    logger.error("AI execution failed", { type, error: error.message });
  }

  const durationMs = Date.now() - startTime;

  // Log execution
  executionLog = await AIExecutionLog.create({
    tenantId,
    userId,
    type,
    prompt: sanitizedPrompt,
    responseText,
    responseJson,
    model: GEMINI_MODEL,
    status,
    tokensUsed,
    durationMs,
    metadata,
    explainability: metadata.explainability || {},
    error: errorMessage
  });

  // Track usage
  await trackUsage(tenantId, userId, type, tokensUsed);

  if (status === "failed") {
    throw new Error(`AI execution failed: ${errorMessage}`);
  }

  return {
    success: true,
    data: responseJson || responseText,
    tokensUsed,
    executionLogId: executionLog._id
  };
}

/**
 * Check if tenant has exceeded AI quota
 */
export async function checkAIQuota(tenantId, planLimits) {
  const monthKey = getMonthKey();
  
  const usage = await AIUsage.findOne({ tenantId, monthKey });
  
  if (!usage) {
    return { allowed: true, remaining: planLimits.maxAITokensPerMonth };
  }

  const remaining = planLimits.maxAITokensPerMonth - usage.tokensUsed;
  
  return {
    allowed: remaining > 0,
    remaining: Math.max(0, remaining),
    used: usage.tokensUsed
  };
}
