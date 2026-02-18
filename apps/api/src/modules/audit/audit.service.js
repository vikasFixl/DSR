/**
 * Audit service. Immutable audit logging with Redis Pub/Sub event publishing.
 * No business logic; pure audit trail creation and broadcast.
 */

import { AuditLog } from "#db/models/index.js";
import { publish } from "#infra/pubsub/publisher.js";
import { pubsubChannels } from "#infra/cache/keys.js";
import { logger } from "#api/utils/logger.js";
import { config } from "#api/config/env.js";

const env = config.app.env;

/**
 * Logs an immutable audit record and publishes audit.created to Redis.
 * @param {object} params
 * @param {string} params.action - Audit action (e.g. AUTH.LOGIN, SYSTEM.HEALTH_CHECK_FAIL)
 * @param {string} params.resourceType - Resource type (e.g. User, Session)
 * @param {import('mongoose').Types.ObjectId | null} [params.resourceId]
 * @param {import('mongoose').Types.ObjectId | null} [params.userId]
 * @param {import('mongoose').Types.ObjectId | null} [params.tenantId]
 * @param {object | null} [params.diff]
 * @param {string | null} [params.ip]
 * @param {string | null} [params.userAgent]
 * @param {object} [params.metadata]
 * @returns {Promise<import('mongoose').Document>}
 */
export async function log({
  action,
  resourceType,
  resourceId = null,
  userId = null,
  tenantId = null,
  diff = null,
  ip = null,
  userAgent = null,
  metadata = {}
}) {
  const doc = await AuditLog.create({
    action,
    resourceType,
    resourceId,
    userId,
    tenantId,
    diff,
    ip,
    userAgent,
    metadata
  });

  const channel = pubsubChannels.auditCreated({
    env,
    tenantId: tenantId ?? "_",
    clusterTenantTag: false
  });
  const payload = {
    id: String(doc._id),
    action: doc.action,
    resourceType: doc.resourceType,
    resourceId: doc.resourceId ? String(doc.resourceId) : null,
    userId: doc.userId ? String(doc.userId) : null,
    tenantId: doc.tenantId ? String(doc.tenantId) : null,
    createdAt: doc.createdAt?.toISOString?.() ?? new Date().toISOString()
  };
  await publish(channel, payload);
  logger.info(
    {
      auditId: doc._id,
      action: doc.action,
      resourceType: doc.resourceType,
      userId: doc.userId,
      tenantId: doc.tenantId
    },
    "Audit log created"
  );
  return doc;
}

/**
 * Lists audit logs with tenant isolation and pagination.
 * @param {object} params
 * @param {import('mongoose').Types.ObjectId | null} [params.tenantId]
 * @param {number} [params.page]
 * @param {number} [params.limit]
 * @param {object} [params.sort]
 * @returns {Promise<{ docs: object[], total: number, page: number, limit: number, pages: number }>}
 */
export async function list({ tenantId = null, page = 1, limit = 20, sort = { createdAt: -1 } }) {
  const filter = tenantId ? { tenantId } : {};
  const skip = (Math.max(1, page) - 1) * Math.max(1, Math.min(limit, 100));
  const actualLimit = Math.max(1, Math.min(limit, 100));
  const [docs, total] = await Promise.all([
    AuditLog.find(filter).sort(sort).skip(skip).limit(actualLimit).lean(),
    AuditLog.countDocuments(filter)
  ]);
  return {
    docs,
    total,
    page: Math.max(1, page),
    limit: actualLimit,
    pages: Math.ceil(total / actualLimit)
  };
}

/**
 * Fetches a single audit log by ID with tenant isolation.
 * @param {string} id
 * @param {import('mongoose').Types.ObjectId | null} [tenantId]
 * @returns {Promise<object | null>}
 */
export async function getById(id, tenantId = null) {
  const filter = { _id: id };
  if (tenantId) filter.tenantId = tenantId;
  return AuditLog.findOne(filter).lean();
}
