/**
 * AIExecutionLog model. Immutable execution log for all AI requests.
 */

import mongoose from "mongoose";
import { toJSONPlugin } from "../plugins/toJSON.plugin.js";

const schema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    type: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    prompt: {
      type: String,
      required: true
    },
    responseText: {
      type: String,
      default: null
    },
    responseJson: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    model: {
      type: String,
      default: "gemini-1.5-flash"
    },
    status: {
      type: String,
      enum: ["success", "failed"],
      default: "success",
      index: true
    },
    tokensUsed: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    durationMs: {
      type: Number,
      default: 0,
      min: 0
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    explainability: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    error: {
      type: String,
      default: null
    }
  },
  {
    strict: true,
    minimize: false,
    timestamps: true,
    optimisticConcurrency: true
  }
);

schema.plugin(toJSONPlugin);

schema.index({ tenantId: 1, createdAt: -1 });
schema.index({ tenantId: 1, userId: 1, createdAt: -1 });
schema.index({ tenantId: 1, type: 1, createdAt: -1 });

export default mongoose.model("AIExecutionLog", schema);
