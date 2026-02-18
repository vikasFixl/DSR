/**
 * TaskTimeLog model. Time entries for tasks (billable/non-billable, start/end).
 */

import mongoose from 'mongoose';
import { toJSONPlugin } from '../plugins/toJSON.plugin.js';
import { tenantPlugin } from '../plugins/tenant.plugin.js';

const schema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    minutes: { type: Number, default: 0 },
    billable: { type: Boolean, default: false },
    note: { type: String, default: null },
  },
  { strict: true, minimize: false, timestamps: true, optimisticConcurrency: true }
);

schema.plugin(toJSONPlugin);
schema.plugin(tenantPlugin);

schema.index({ tenantId: 1, taskId: 1, startedAt: -1 });
schema.index({ tenantId: 1, userId: 1, startedAt: -1 });

export default mongoose.model('TaskTimeLog', schema);
