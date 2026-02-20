/**
 * Tenant service. All tenant and settings business logic; DB, Redis, audit, notifications.
 */

import mongoose from "mongoose";
import {
  Tenant,
  TenantMembership,
  TenantSettings,
  TenantUsage,
  PlanCatalog,
  Subscription,
  Role,
} from "#db/models/index.js";
import * as auditService from "#api/modules/audit/audit.service.js";
import * as notificationService from "#api/modules/notification/notification.service.js";
import { ApiError } from "#api/utils/ApiError.js";
import { logger } from "#api/utils/logger.js";
import { config } from "#api/config/env.js";

const env = config.app.env;
const FREE_PLAN_CODE = "free";

/**
 * Fetches the free plan from PlanCatalog.
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function getFreePlan() {
  const plan = await PlanCatalog.findOne({
    planCode: FREE_PLAN_CODE,
    isActive: true,
  }).lean();
  return plan;
}

/**
 * Ensures Owner role exists (platform role); creates if not.
 * @returns {Promise<import('mongoose').Document>}
 */
async function ensureOwnerRole() {
  let role = await Role.findOne({ name: "Owner" }).lean();
  if (!role) {
    const created = await Role.create({
      name: "Owner",
      description: "Tenant owner with full access",
      isPlatformRole: true,
      permissions: [],
    });
    role = created.toObject();
    logger.info({ roleId: created._id }, "Owner role created");
  }
  return role;
}

/**
 * Creates a new tenant with free plan, subscription, owner membership, settings, and usage.
 * @param {object} input
 * @param {string} input.name
 * @param {string} input.slug
 * @param {object} [input.metadata]
 * @param {string} userId
 * @param {{ ip?: string, userAgent?: string }} [ctx]
 * @returns {Promise<object>}
 */
export async function createTenant(input, userId, ctx = {}) {
  const slug = input.slug.toLowerCase().trim();
  const existing = await Tenant.findOne({ slug }).lean();
  if (existing) {
    throw ApiError.conflict("Tenant slug already exists");
  }

  const freePlan = await getFreePlan();
  if (!freePlan) {
    logger.error({ FREE_PLAN_CODE }, "Free plan not found in PlanCatalog");
    throw ApiError.serviceUnavailable("Free plan not configured");
  }

  const ownerRole = await ensureOwnerRole();
  const ownerRoleId = ownerRole._id;
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const [tenant] = await Tenant.create([
    {
      name: input.name.trim(),
      slug,
      status: "active",
      planId: freePlan._id,
      stripeCustomerId: null,
      metadata: input.metadata ?? {},
    },
  ]);

  const tenantId = tenant._id;
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);

  await Subscription.create({
    tenantId,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    planId: freePlan._id,
    status: "active",
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
  });

  await TenantMembership.create({
    tenantId,
    userId: userObjectId,
    roleId: ownerRoleId,
    status: "active",
    joinedAt: now,
    isOwner: true,
  });

  const defaultCategories = [
    { key: "branding", value: {}, category: "branding" },
    { key: "security", value: {}, category: "security" },
    { key: "notifications", value: {}, category: "notifications" },
  ];
  await TenantSettings.insertMany(
    defaultCategories.map(({ key, value, category }) => ({
      tenantId,
      key,
      value,
      category,
    }))
  );

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const monthKey = `${year}${month}`;
  await TenantUsage.create({
    tenantId,
    monthKey,
    activeUsers: 1,
    apiCalls: 0,
    storageBytes: 0,
  });

  await auditService
    .log({
      action: "TENANT_CREATED",
      resourceType: "Tenant",
      resourceId: tenantId,
      userId: userObjectId,
      tenantId,
      diff: { name: tenant.name, slug: tenant.slug, planId: String(freePlan._id) },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  await notificationService
    .createNotification({
      userId: userObjectId,
      tenantId,
      type: "tenant_created",
      title: "Workspace created",
      body: `Workspace "${tenant.name}" is ready. You are the owner.`,
      link: `/tenants/${tenantId}`,
      priority: "normal",
      payload: { tenantId: String(tenantId), name: tenant.name },
    })
    .catch((err) => logger.warn({ err }, "Notification create failed"));

  logger.info({ tenantId, userId, slug }, "Tenant created");
  return tenant.toObject();
}

/**
 * Returns tenant details if user has active membership.
 * @param {string} tenantId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getTenant(tenantId, userId) {
  const membership = await TenantMembership.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: new mongoose.Types.ObjectId(userId),
    status: "active",
  }).lean();
  if (!membership) {
    throw ApiError.forbidden("Not a member of this tenant");
  }

  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) {
    throw ApiError.notFound("Tenant not found");
  }
  return tenant;
}

/**
 * Updates tenant name and metadata. Owner only.
 * @param {string} tenantId
 * @param {object} input
 * @param {string} [input.name]
 * @param {object} [input.metadata]
 * @param {string} userId
 * @param {{ ip?: string, userAgent?: string }} [ctx]
 * @returns {Promise<object>}
 */
export async function updateTenant(tenantId, userId, input, ctx = {}) {
  const membership = await TenantMembership.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: new mongoose.Types.ObjectId(userId),
    status: "active",
    isOwner: true,
  });
  if (!membership) {
    throw ApiError.forbidden("Tenant owner access required");
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw ApiError.notFound("Tenant not found");
  }

  const diff = {};
  if (input.name !== undefined) {
    diff.name = { from: tenant.name, to: input.name };
    tenant.name = input.name.trim();
  }
  if (input.metadata !== undefined) {
    diff.metadata = input.metadata;
    tenant.metadata = input.metadata;
  }
  await tenant.save();

  await auditService
    .log({
      action: "TENANT_UPDATED",
      resourceType: "Tenant",
      resourceId: tenant._id,
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: tenant._id,
      diff,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.info({ tenantId, userId }, "Tenant updated");
  return tenant.toObject();
}

/**
 * Soft-suspends tenant. Owner only.
 * @param {string} tenantId
 * @param {string} userId
 * @param {{ ip?: string, userAgent?: string }} [ctx]
 * @returns {Promise<object>}
 */
export async function suspendTenant(tenantId, userId, ctx = {}) {
  const membership = await TenantMembership.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: new mongoose.Types.ObjectId(userId),
    status: "active",
    isOwner: true,
  });
  if (!membership) {
    throw ApiError.forbidden("Tenant owner access required");
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw ApiError.notFound("Tenant not found");
  }
  const previousStatus = tenant.status;
  tenant.status = "suspended";
  await tenant.save();

  await auditService
    .log({
      action: "TENANT_SUSPENDED",
      resourceType: "Tenant",
      resourceId: tenant._id,
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: tenant._id,
      diff: { status: { from: previousStatus, to: "suspended" } },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.info({ tenantId, userId }, "Tenant suspended");
  return tenant.toObject();
}

/**
 * Returns structured settings for tenant (membership required).
 * @param {string} tenantId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getSettings(tenantId, userId) {
  const membership = await TenantMembership.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: new mongoose.Types.ObjectId(userId),
    status: "active",
  }).lean();
  if (!membership) {
    throw ApiError.forbidden("Not a member of this tenant");
  }

  const docs = await TenantSettings.find({
    tenantId: new mongoose.Types.ObjectId(tenantId),
  }).lean();

  const settings = {
    branding: {},
    security: {},
    notifications: {},
  };
  for (const d of docs) {
    if (d.category === "branding") settings.branding[d.key] = d.value;
    else if (d.category === "security") settings.security[d.key] = d.value;
    else if (d.category === "notifications") settings.notifications[d.key] = d.value;
  }
  return settings;
}

/**
 * Updates tenant settings. Owner only. Allowed categories: branding, security, notifications.
 * @param {string} tenantId
 * @param {object} input
 * @param {object} [input.branding]
 * @param {object} [input.security]
 * @param {object} [input.notifications]
 * @param {string} userId
 * @param {{ ip?: string, userAgent?: string }} [ctx]
 * @returns {Promise<object>}
 */
export async function updateSettings(tenantId, userId, input, ctx = {}) {
  const membership = await TenantMembership.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: new mongoose.Types.ObjectId(userId),
    status: "active",
    isOwner: true,
  });
  if (!membership) {
    throw ApiError.forbidden("Tenant owner access required");
  }

  const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
  const diff = {};

  for (const category of ["branding", "security", "notifications"]) {
    const value = input[category];
    if (value === undefined || typeof value !== "object") continue;
    for (const [key, val] of Object.entries(value)) {
      await TenantSettings.findOneAndUpdate(
        { tenantId: tenantObjectId, key, category },
        { $set: { value: val } },
        { upsert: true, new: true }
      );
      diff[category] = diff[category] || {};
      diff[category][key] = val;
    }
  }

  await auditService
    .log({
      action: "SETTINGS_UPDATED",
      resourceType: "TenantSettings",
      resourceId: null,
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: tenantObjectId,
      diff,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.info({ tenantId, userId }, "Settings updated");
  return getSettings(tenantId, userId);
}
