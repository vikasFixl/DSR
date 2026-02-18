/**
 * Notification service. Creates notifications and publishes to Redis for real-time delivery.
 */

import { Notification } from "#db/models/index.js";
import { publishNotificationCreated } from "#api/modules/notification/notification.publisher.js";
import { pubsubChannels } from "#infra/cache/keys.js";
import { logger } from "#api/utils/logger.js";
import { config } from "#api/config/env.js";

const env = config.app.env;

/**
 * Creates a notification, saves to Mongo, and publishes to Redis.
 * @param {object} params
 * @param {import('mongoose').Types.ObjectId} params.userId
 * @param {import('mongoose').Types.ObjectId | null} [params.tenantId]
 * @param {string} params.type
 * @param {string} params.title
 * @param {string} [params.body]
 * @param {string} [params.link]
 * @param {'low'|'normal'|'high'|'critical'} [params.priority]
 * @param {object} [params.payload]
 * @returns {Promise<import('mongoose').Document>}
 */
export async function createNotification({
  userId,
  tenantId = null,
  type,
  title,
  body = null,
  link = null,
  priority = "normal",
  payload = {}
}) {
  const doc = await Notification.create({
    userId,
    tenantId,
    type,
    title,
    body,
    link,
    priority,
    payload
  });

  const channel = pubsubChannels.notificationCreated({
    env,
    tenantId: tenantId ?? "_",
    clusterTenantTag: false
  });
  const payloadForPub = {
    id: String(doc._id),
    userId: String(doc.userId),
    type: doc.type,
    title: doc.title,
    body: doc.body,
    link: doc.link,
    priority: doc.priority,
    createdAt: doc.createdAt?.toISOString?.() ?? new Date().toISOString()
  };
  await publishNotificationCreated(channel, payloadForPub);
  logger.info(
    { notificationId: doc._id, userId: doc.userId, type: doc.type, tenantId: doc.tenantId },
    "Notification created"
  );
  return doc;
}

/**
 * Lists notifications for a user with pagination.
 * @param {object} params
 * @param {import('mongoose').Types.ObjectId} params.userId
 * @param {import('mongoose').Types.ObjectId | null} [params.tenantId]
 * @param {number} [params.page]
 * @param {number} [params.limit]
 * @param {boolean} [params.unreadOnly]
 * @returns {Promise<{ docs: object[], total: number, page: number, limit: number, pages: number }>}
 */
export async function list({
  userId,
  tenantId = null,
  page = 1,
  limit = 20,
  unreadOnly = false
}) {
  const filter = { userId };
  if (tenantId) filter.tenantId = tenantId;
  if (unreadOnly) filter.readAt = null;

  const skip = (Math.max(1, page) - 1) * Math.max(1, Math.min(limit, 100));
  const actualLimit = Math.max(1, Math.min(limit, 100));
  const [docs, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(actualLimit).lean(),
    Notification.countDocuments(filter)
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
 * Returns unread count for a user.
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {import('mongoose').Types.ObjectId | null} [tenantId]
 * @returns {Promise<number>}
 */
export async function getUnreadCount(userId, tenantId = null) {
  const filter = { userId, readAt: null };
  if (tenantId) filter.tenantId = tenantId;
  return Notification.countDocuments(filter);
}

/**
 * Marks a notification as read.
 * @param {string} id
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {import('mongoose').Types.ObjectId | null} [tenantId]
 * @returns {Promise<object | null>}
 */
export async function markAsRead(id, userId, tenantId = null) {
  const filter = { _id: id, userId };
  if (tenantId) filter.tenantId = tenantId;
  const doc = await Notification.findOneAndUpdate(
    filter,
    { $set: { readAt: new Date() } },
    { new: true }
  ).lean();
  return doc;
}
