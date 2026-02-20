/**
 * Membership service. Invites, accept, list, update, remove, transfer ownership.
 * All DB, Redis, audit, notification and limit checks here.
 */

import crypto from "node:crypto";
import mongoose from "mongoose";
import {
  Tenant,
  TenantMembership,
  TenantInvite,
  TenantUsage,
  PlanCatalog,
  Subscription,
  User,
} from "#db/models/index.js";
import * as auditService from "#api/modules/audit/audit.service.js";
import * as notificationService from "#api/modules/notification/notification.service.js";
import { enqueueTenantInviteEmail } from "#infra/queue/email.queue.js";
import { ApiError } from "#api/utils/ApiError.js";
import { logger } from "#api/utils/logger.js";
import { config } from "#api/config/env.js";

const env = config.app.env;
const INVITE_TTL_DAYS = 7;
const APP_PUBLIC_URL = config.app.publicUrl || "http://localhost:3000";

/**
 * Hashes a token for storage (never store plain tokens).
 * @param {string} token
 * @returns {string}
 */
function hashToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Returns current month key YYYYMM.
 */
function getCurrentMonthKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

/**
 * Gets or creates TenantUsage for tenant + month; returns doc.
 * @param {import('mongoose').Types.ObjectId} tenantId
 * @param {string} monthKey
 * @returns {Promise<import('mongoose').Document>}
 */
async function getOrCreateUsage(tenantId, monthKey) {
  let usage = await TenantUsage.findOne({ tenantId, monthKey });
  if (!usage) {
    usage = await TenantUsage.create({
      tenantId,
      monthKey,
      activeUsers: 0,
      apiCalls: 0,
      storageBytes: 0,
    });
  }
  return usage;
}

/**
 * Checks plan maxUsers limit for tenant.
 * @param {string} tenantId
 * @returns {Promise<{ allowed: boolean, current: number, max: number }>}
 */
async function checkMaxUsersLimit(tenantId) {
  const tenant = await Tenant.findById(tenantId).select("planId").lean();
  if (!tenant?.planId) {
    return { allowed: false, current: 0, max: 0 };
  }
  const plan = await PlanCatalog.findById(tenant.planId).lean();
  const max = plan?.limits?.maxUsers ?? 0;
  const monthKey = getCurrentMonthKey();
  const usage = await TenantUsage.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    monthKey,
  }).lean();
  const current = usage?.activeUsers ?? 0;
  return { allowed: current < max, current, max };
}

/**
 * Paginated list of members (with user and role populated).
 * @param {string} tenantId
 * @param {string} userId - caller (must be member)
 * @param {{ page: number, limit: number }} opts
 * @returns {Promise<{ docs: object[], total: number, page: number, limit: number, pages: number }>}
 */
export async function listMembers(tenantId, userId, opts = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));

  const membership = await TenantMembership.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: new mongoose.Types.ObjectId(userId),
    status: "active",
  }).lean();
  if (!membership) {
    throw ApiError.forbidden("Not a member of this tenant");
  }

  const filter = { tenantId: new mongoose.Types.ObjectId(tenantId) };
  const [docs, total] = await Promise.all([
    TenantMembership.find(filter)
      .populate("userId", "name email")
      .populate("roleId", "name")
      .sort({ isOwner: -1, createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    TenantMembership.countDocuments(filter),
  ]);

  return {
    docs,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

/**
 * Invites a member by email. Owner/Admin only; checks maxUsers; sends invite email.
 * @param {string} tenantId
 * @param {object} input - { email, roleId }
 * @param {string} invitedByUserId
 * @param {{ ip?: string, userAgent?: string }} [ctx]
 * @returns {Promise<object>}
 */
export async function inviteMember(tenantId, input, invitedByUserId, ctx = {}) {
  const membership = await TenantMembership.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: new mongoose.Types.ObjectId(invitedByUserId),
    status: "active",
    isOwner: true,
  }).lean();
  if (!membership) {
    throw ApiError.forbidden("Tenant owner or admin access required");
  }

  const { allowed, current, max } = await checkMaxUsersLimit(tenantId);
  if (!allowed) {
    throw ApiError.forbidden(
      `Plan limit reached: active users (${current}) >= max users (${max}). Upgrade to invite more.`
    );
  }

  const email = input.email.toLowerCase().trim();
  const existingMember = await TenantMembership.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: (await User.findOne({ email }).select("_id").lean())?._id,
  }).lean();
  if (existingMember) {
    throw ApiError.conflict("User is already a member");
  }

  const pendingInvite = await TenantInvite.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    email,
    status: "pending",
  }).lean();
  if (pendingInvite) {
    throw ApiError.conflict("Pending invite already exists for this email");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);

  const invite = await TenantInvite.create({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    email,
    roleId: new mongoose.Types.ObjectId(input.roleId),
    invitedBy: new mongoose.Types.ObjectId(invitedByUserId),
    tokenHash,
    expiresAt,
    status: "pending",
  });

  const tenant = await Tenant.findById(tenantId).select("name").lean();
  const inviter = await User.findById(invitedByUserId).select("name").lean();
  const acceptLink = `${APP_PUBLIC_URL}/invite/accept?token=${encodeURIComponent(token)}&tenantId=${tenantId}`;

  try {
    await enqueueTenantInviteEmail({
      to: email,
      inviteeName: null,
      inviterName: inviter?.name ?? "A team member",
      tenantName: tenant?.name ?? "Workspace",
      acceptLink,
      expiresInDays: INVITE_TTL_DAYS,
    });
  } catch (err) {
    logger.warn({ err, inviteId: invite._id }, "Invite email enqueue failed");
  }

  await auditService
    .log({
      action: "MEMBER_INVITED",
      resourceType: "TenantInvite",
      resourceId: invite._id,
      userId: new mongoose.Types.ObjectId(invitedByUserId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      diff: { email, roleId: String(input.roleId) },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.info({ tenantId, email, inviteId: invite._id }, "Member invited");
  return {
    id: invite._id,
    email: invite.email,
    roleId: invite.roleId,
    expiresAt: invite.expiresAt,
    status: invite.status,
  };
}

/**
 * Accepts an invite with token; creates membership and increments activeUsers.
 * @param {string} tenantId
 * @param {string} token - plain token from email
 * @param {string} userId - authenticated user accepting
 * @param {{ ip?: string, userAgent?: string }} [ctx]
 * @returns {Promise<object>}
 */
export async function acceptInvite(tenantId, token, userId, ctx = {}) {
  const tokenHash = hashToken(token);
  const invite = await TenantInvite.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    tokenHash,
    status: "pending",
  }).select("+tokenHash").lean();

  if (!invite) {
    throw ApiError.badRequest("Invalid or expired invite token");
  }
  if (new Date() > new Date(invite.expiresAt)) {
    await TenantInvite.updateOne(
      { _id: invite._id },
      { $set: { status: "expired" } }
    );
    throw ApiError.badRequest("Invite has expired");
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const user = await User.findById(userId).select("email").lean();
  if (!user || user.email.toLowerCase() !== invite.email) {
    throw ApiError.forbidden("Invite was sent to a different email; sign in with that account to accept");
  }

  const existing = await TenantMembership.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: userObjectId,
  }).lean();
  if (existing) {
    throw ApiError.conflict("Already a member of this tenant");
  }

  await TenantMembership.create({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: userObjectId,
    roleId: invite.roleId,
    status: "active",
    joinedAt: new Date(),
    invitedBy: invite.invitedBy,
    isOwner: false,
  });

  const monthKey = getCurrentMonthKey();
  const usage = await getOrCreateUsage(
    new mongoose.Types.ObjectId(tenantId),
    monthKey
  );
  usage.activeUsers = (usage.activeUsers || 0) + 1;
  await usage.save();

  await TenantInvite.updateOne(
    { _id: invite._id },
    { $set: { status: "accepted" } }
  );

  await auditService
    .log({
      action: "MEMBER_JOINED",
      resourceType: "TenantMembership",
      resourceId: null,
      userId: userObjectId,
      tenantId: new mongoose.Types.ObjectId(tenantId),
      diff: { email: invite.email, roleId: String(invite.roleId) },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  const tenant = await Tenant.findById(tenantId).select("name").lean();
  await notificationService
    .createNotification({
      userId: userObjectId,
      tenantId: new mongoose.Types.ObjectId(tenantId),
      type: "member_joined",
      title: "Joined workspace",
      body: `You joined "${tenant?.name ?? "Workspace"}".`,
      link: `/tenants/${tenantId}`,
      priority: "normal",
      payload: { tenantId, inviteId: String(invite._id) },
    })
    .catch((err) => logger.warn({ err }, "Notification create failed"));

  logger.info({ tenantId, userId }, "Member joined via invite");
  return { success: true, tenantId };
}

/**
 * Updates a member's role/team/status. Owner/Admin only.
 * @param {string} tenantId
 * @param {string} targetUserId
 * @param {object} input - { roleId?, teamId?, status? }
 * @param {string} userId - caller
 * @param {{ ip?: string, userAgent?: string }} [ctx]
 * @returns {Promise<object>}
 */
export async function updateMembership(tenantId, targetUserId, input, userId, ctx = {}) {
  const membership = await TenantMembership.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: new mongoose.Types.ObjectId(userId),
    status: "active",
    isOwner: true,
  }).lean();
  if (!membership) {
    throw ApiError.forbidden("Tenant owner or admin access required");
  }

  const target = await TenantMembership.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: new mongoose.Types.ObjectId(targetUserId),
  });
  if (!target) {
    throw ApiError.notFound("Member not found");
  }

  const diff = {};
  if (input.roleId !== undefined) {
    diff.roleId = { from: String(target.roleId), to: String(input.roleId) };
    target.roleId = new mongoose.Types.ObjectId(input.roleId);
  }
  if (input.teamId !== undefined) {
    target.teamId = input.teamId
      ? new mongoose.Types.ObjectId(input.teamId)
      : null;
    diff.teamId = input.teamId;
  }
  if (input.status !== undefined) {
    diff.status = { from: target.status, to: input.status };
    target.status = input.status;
  }
  await target.save();

  await auditService
    .log({
      action: "MEMBER_UPDATED",
      resourceType: "TenantMembership",
      resourceId: target._id,
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      diff,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.info({ tenantId, targetUserId }, "Membership updated");
  return target.toObject();
}

/**
 * Disables membership and decrements activeUsers.
 * @param {string} tenantId
 * @param {string} targetUserId
 * @param {string} userId - caller (owner/admin)
 * @param {{ ip?: string, userAgent?: string }} [ctx]
 * @returns {Promise<object>}
 */
export async function removeMember(tenantId, targetUserId, userId, ctx = {}) {
  const membership = await TenantMembership.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: new mongoose.Types.ObjectId(userId),
    status: "active",
    isOwner: true,
  }).lean();
  if (!membership) {
    throw ApiError.forbidden("Tenant owner or admin access required");
  }

  const target = await TenantMembership.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: new mongoose.Types.ObjectId(targetUserId),
  });
  if (!target) {
    throw ApiError.notFound("Member not found");
  }
  if (target.isOwner) {
    throw ApiError.forbidden("Cannot remove the owner; transfer ownership first");
  }

  target.status = "disabled";
  await target.save();

  const monthKey = getCurrentMonthKey();
  const usage = await TenantUsage.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    monthKey,
  });
  if (usage && usage.activeUsers > 0) {
    usage.activeUsers -= 1;
    await usage.save();
  }

  await auditService
    .log({
      action: "MEMBER_REMOVED",
      resourceType: "TenantMembership",
      resourceId: target._id,
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      diff: { targetUserId, status: "disabled" },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  await notificationService
    .createNotification({
      userId: new mongoose.Types.ObjectId(targetUserId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      type: "member_removed",
      title: "Removed from workspace",
      body: "You have been removed from this workspace.",
      link: null,
      priority: "normal",
      payload: { tenantId },
    })
    .catch((err) => logger.warn({ err }, "Notification create failed"));

  logger.info({ tenantId, targetUserId }, "Member removed");
  return { success: true };
}

/**
 * Transfers ownership to another member. Only current owner.
 * @param {string} tenantId
 * @param {string} newOwnerUserId
 * @param {string} userId - current owner
 * @param {{ ip?: string, userAgent?: string }} [ctx]
 * @returns {Promise<object>}
 */
export async function transferOwnership(tenantId, newOwnerUserId, userId, ctx = {}) {
  const currentOwner = await TenantMembership.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: new mongoose.Types.ObjectId(userId),
    status: "active",
    isOwner: true,
  });
  if (!currentOwner) {
    throw ApiError.forbidden("Only the current owner can transfer ownership");
  }

  const newOwnerMembership = await TenantMembership.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: new mongoose.Types.ObjectId(newOwnerUserId),
    status: "active",
  });
  if (!newOwnerMembership) {
    throw ApiError.notFound("Target user is not an active member");
  }

  currentOwner.isOwner = false;
  await currentOwner.save();
  newOwnerMembership.isOwner = true;
  await newOwnerMembership.save();

  await auditService
    .log({
      action: "OWNER_TRANSFERRED",
      resourceType: "TenantMembership",
      resourceId: newOwnerMembership._id,
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      diff: {
        previousOwnerId: String(userId),
        newOwnerId: String(newOwnerUserId),
      },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  await notificationService
    .createNotification({
      userId: new mongoose.Types.ObjectId(newOwnerUserId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      type: "owner_transferred",
      title: "You are now the owner",
      body: "Ownership of this workspace has been transferred to you.",
      link: `/tenants/${tenantId}/settings`,
      priority: "high",
      payload: { tenantId, previousOwnerId: String(userId) },
    })
    .catch((err) => logger.warn({ err }, "Notification create failed"));

  logger.info({ tenantId, newOwnerUserId, previousOwnerId: userId }, "Ownership transferred");
  return { success: true, newOwnerId: newOwnerUserId };
}
