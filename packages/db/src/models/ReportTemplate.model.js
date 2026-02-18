/**
 * ReportTemplate model. Reusable report definitions (name, type, config) for generating reports.
 */

import mongoose from 'mongoose';
import { toJSONPlugin } from '../plugins/toJSON.plugin.js';
import { tenantPlugin } from '../plugins/tenant.plugin.js';
import { auditChainPlugin } from '../plugins/auditChain.plugin.js';

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { strict: true, minimize: false, timestamps: true, optimisticConcurrency: true }
);

schema.plugin(toJSONPlugin);
schema.plugin(tenantPlugin);
schema.plugin(auditChainPlugin);

schema.index({ tenantId: 1, type: 1 });
schema.index({ tenantId: 1, status: 1 });

export default mongoose.model('ReportTemplate', schema);
