/**
 * Notification model. In-app or push notifications for users (read/unread, link, payload).
 */

import mongoose from 'mongoose';
import { toJSONPlugin } from '../plugins/toJSON.plugin.js';
import { tenantPlugin } from '../plugins/tenant.plugin.js';

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: null },
    link: { type: String, default: null },
    readAt: { type: Date, default: null },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { strict: true, minimize: false, timestamps: true, optimisticConcurrency: true }
);

schema.plugin(toJSONPlugin);
schema.plugin(tenantPlugin);

schema.index({ tenantId: 1, userId: 1, readAt: 1 });
schema.index({ tenantId: 1, userId: 1, createdAt: -1 });

export default mongoose.model('Notification', schema);
