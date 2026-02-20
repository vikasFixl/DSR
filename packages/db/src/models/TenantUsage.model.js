/**
 * TenantUsage model. Monthly usage counters per tenant (activeUsers, apiCalls, storageBytes).
 * Used for plan limit enforcement and billing.
 */

import mongoose from 'mongoose';
import { toJSONPlugin } from '../plugins/toJSON.plugin.js';

const schema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    monthKey: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{6}$/, // YYYYMM
      index: true,
    },
    activeUsers: {
      type: Number,
      default: 0,
      min: 0,
    },
    apiCalls: {
      type: Number,
      default: 0,
      min: 0,
    },
    storageBytes: {
      type: Number,
      default: 0,
      min: 0,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { strict: true, minimize: false, timestamps: true, optimisticConcurrency: true }
);

schema.plugin(toJSONPlugin);

schema.index({ tenantId: 1, monthKey: 1 }, { unique: true });

export default mongoose.model('TenantUsage', schema);
