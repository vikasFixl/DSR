/**
 * MFADevice model. Stores MFA device/credential bindings per user (TOTP, backup codes).
 */

import mongoose from 'mongoose';
import { toJSONPlugin } from '../plugins/toJSON.plugin.js';
import { tenantPlugin } from '../plugins/tenant.plugin.js';

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['totp', 'backup'], required: true },
    secretEncrypted: { type: String, default: null },
    name: { type: String, trim: true },
    verifiedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  { strict: true, minimize: false, timestamps: true, optimisticConcurrency: true }
);

schema.plugin(toJSONPlugin);
// schema.plugin(tenantPlugin);

// schema.index({ tenantId: 1, userId: 1, type: 1 });
// schema.index({ tenantId: 1, userId: 1 });

export default mongoose.model('MFADevice', schema);
