/**
 * AIInsight model. Stores long-term AI-generated insights.
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
    title: {
      type: String,
      default: null
    },
    insight: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    tokensUsed: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
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

schema.index({ tenantId: 1, type: 1, createdAt: -1 });
schema.index({ tenantId: 1, userId: 1, createdAt: -1 });

export default mongoose.model("AIInsight", schema);
