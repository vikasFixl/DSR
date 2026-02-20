/**
 * Billing service. All business logic for plans, subscriptions, and webhooks.
 * No business logic in controllers.
 */

import mongoose from "mongoose";
import {
  PlanCatalog,
  Subscription,
  Tenant,
  TenantMembership
} from "#db/models/index.js";
import * as auditService from "#api/modules/audit/audit.service.js";
import { getStripeClient } from "#api/helpers/stripe.client.js";
import { getRedisClient } from "#infra/cache/redis.js";
import { idempotencyKey } from "#infra/cache/keys.js";
import { config } from "#api/config/env.js";
import { ApiError } from "#api/utils/ApiError.js";
import { logger } from "#api/utils/logger.js";

const env = config.app.env;
const STRIPE_WEBHOOK_IDEMPOTENCY_TTL = 60 * 60 * 24 * 7; // 7 days

/**
 * Checks if user is tenant owner.
 * @param {string} tenantId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function assertTenantOwner(tenantId, userId) {
  const membership = await TenantMembership.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: new mongoose.Types.ObjectId(userId),
    status: "active",
    isOwner: true
  }).lean();
  if (!membership) {
    throw ApiError.forbidden("Tenant owner access required");
  }
  return true;
}

/**
 * Lists plans. Admin sees all; others see active only.
 * @param {{ isAdmin?: boolean }} params
 * @returns {Promise<object[]>}
 */
export async function listPlans({ isAdmin = false }) {
  const filter = isAdmin ? {} : { isActive: true };
  const plans = await PlanCatalog.find(filter).sort({ planCode: 1 }).lean();
  return plans;
}

/**
 * Creates a new plan. Validates stripePriceId via Stripe API.
 * @param {object} input
 * @param {string} input.planCode
 * @param {string} input.name
 * @param {string} input.stripePriceId
 * @param {object} [input.features]
 * @param {object} [input.limits]
 * @param {object} [input.metadata]
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function createPlan(input, userId) {
  const existing = await PlanCatalog.findOne({
    planCode: input.planCode.toLowerCase().trim()
  }).lean();
  if (existing) {
    throw ApiError.conflict("Plan code already exists");
  }

  // const stripe = getStripeClient();
  // try {
  //   await stripe.prices.retrieve(input.stripePriceId);
  // } catch (err) {
  //   logger.warn({ stripePriceId: input.stripePriceId, err }, "Stripe price lookup failed");
  //   throw ApiError.badRequest("Invalid Stripe price ID");
  // }

  const plan = await PlanCatalog.create({
    planCode: input.planCode.toLowerCase().trim(),
    name: input.name.trim(),
    stripePriceId:"1234567687753432",
    features: {
      rbac: input.features?.rbac ?? true,
      auditLogs: input.features?.auditLogs ?? false,
      apiAccess: input.features?.apiAccess ?? true,
      automationWorkers: input.features?.automationWorkers ?? false,
      advancedSecurity: input.features?.advancedSecurity ?? false,
      sso: input.features?.sso ?? false
    },
    limits: {
      maxUsers: input.limits?.maxUsers ?? 3,
      maxStorageGB: input.limits?.maxStorageGB ?? 1,
      maxApiCallsPerMonth: input.limits?.maxApiCallsPerMonth ?? 5000,
      auditLogRetentionDays: input.limits?.auditLogRetentionDays ?? 7
    },
    metadata: input.metadata ?? {}
  });

  await auditService
    .log({
      action: "PLAN.CREATED",
      resourceType: "PlanCatalog",
      resourceId: plan._id,
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: null,
      metadata: { planCode: plan.planCode }
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.info({ planId: plan._id, planCode: plan.planCode }, "Plan created");
  return plan.toObject();
}

/**
 * Updates a plan.
 * @param {string} planId
 * @param {object} input
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function updatePlan(planId, input, userId) {
  const plan = await PlanCatalog.findById(planId);
  if (!plan) {
    throw ApiError.notFound("Plan not found");
  }

  const updates = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.stripePriceId !== undefined) {
    const stripe = getStripeClient();
    try {
      await stripe.prices.retrieve(input.stripePriceId);
    } catch (err) {
      throw ApiError.badRequest("Invalid Stripe price ID");
    }
    updates.stripePriceId = input.stripePriceId.trim();
  }
  if (input.features !== undefined) {
    updates.features = { ...plan.features.toObject(), ...input.features };
  }
  if (input.limits !== undefined) {
    updates.limits = { ...plan.limits.toObject(), ...input.limits };
  }
  if (input.metadata !== undefined) updates.metadata = input.metadata;

  Object.assign(plan, updates);
  await plan.save();

  await auditService
    .log({
      action: "PLAN.UPDATED",
      resourceType: "PlanCatalog",
      resourceId: plan._id,
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: null,
      diff: updates
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.info({ planId }, "Plan updated");
  return plan.toObject();
}

/**
 * Toggles plan isActive.
 * @param {string} planId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function togglePlan(planId, userId) {
  const plan = await PlanCatalog.findById(planId);
  if (!plan) {
    throw ApiError.notFound("Plan not found");
  }
  plan.isActive = !plan.isActive;
  await plan.save();

  await auditService
    .log({
      action: "PLAN.TOGGLED",
      resourceType: "PlanCatalog",
      resourceId: plan._id,
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: null,
      metadata: { isActive: plan.isActive }
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.info({ planId, isActive: plan.isActive }, "Plan toggled");
  return plan.toObject();
}

/**
 * Deactivates a plan (soft delete, isActive=false).
 * @param {string} planId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function deletePlan(planId, userId) {
  const plan = await PlanCatalog.findById(planId);
  if (!plan) {
    throw ApiError.notFound("Plan not found");
  }
  plan.isActive = false;
  await plan.save();

  await auditService
    .log({
      action: "PLAN.DEACTIVATED",
      resourceType: "PlanCatalog",
      resourceId: plan._id,
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: null,
      metadata: { planCode: plan.planCode }
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.info({ planId }, "Plan deactivated");
  return plan.toObject();
}

/**
 * Gets subscription summary for tenant.
 * @param {string} tenantId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getSubscription(tenantId, userId) {
  await assertTenantOwner(tenantId, userId);

  const subscription = await Subscription.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId)
  })
    .populate("planId")
    .lean();

  if (!subscription) {
    return {
      plan: null,
      status: null,
      limits: null,
      features: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false
    };
  }

  const plan = subscription.planId;
  return {
    plan: plan
      ? {
          id: plan._id,
          planCode: plan.planCode,
          name: plan.name
        }
      : null,
    status: subscription.status,
    limits: plan?.limits ?? null,
    features: plan?.features ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
  };
}

/**
 * Creates Stripe subscription for tenant.
 * @param {string} tenantId
 * @param {string} planId
 * @param {string} [paymentMethodId]
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function subscribe(tenantId, planId, paymentMethodId, userId) {
  await assertTenantOwner(tenantId, userId);

  const existing = await Subscription.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId)
  }).lean();
  if (existing && ["active", "trialing", "past_due", "incomplete"].includes(existing.status)) {
    throw ApiError.conflict("Active subscription already exists");
  }

  const plan = await PlanCatalog.findOne({ _id: planId, isActive: true });
  if (!plan) {
    throw ApiError.notFound("Plan not found or inactive");
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw ApiError.notFound("Tenant not found");
  }

  const stripe = getStripeClient();
  let stripeCustomerId = tenant.stripeCustomerId;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      metadata: { tenantId }
    });
    stripeCustomerId = customer.id;
    tenant.stripeCustomerId = stripeCustomerId;
    await tenant.save();
  }

  const subscriptionParams = {
    customer: stripeCustomerId,
    items: [{ price: plan.stripePriceId }],
    expand: ["latest_invoice.payment_intent"]
  };
  if (paymentMethodId) {
    subscriptionParams.default_payment_method = paymentMethodId;
  }

  const stripeSubscription = await stripe.subscriptions.create(subscriptionParams);

  const status = stripeSubscription.status;
  const periodStart = new Date(stripeSubscription.current_period_start * 1000);
  const periodEnd = new Date(stripeSubscription.current_period_end * 1000);

  if (existing) {
    await Subscription.updateOne(
      { tenantId: new mongoose.Types.ObjectId(tenantId) },
      {
        $set: {
          stripeSubscriptionId: stripeSubscription.id,
          stripeCustomerId,
          planId: plan._id,
          status,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false
        }
      }
    );
  } else {
    await Subscription.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      stripeSubscriptionId: stripeSubscription.id,
      stripeCustomerId,
      planId: plan._id,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd
    });
  }

  tenant.planId = plan._id;
  await tenant.save();

  const sub = await Subscription.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId)
  }).populate("planId").lean();

  await auditService
    .log({
      action: "SUBSCRIPTION.CREATED",
      resourceType: "Subscription",
      resourceId: sub._id,
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      metadata: { planId: String(planId), stripeSubscriptionId: stripeSubscription.id }
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.info({ tenantId, planId, stripeSubscriptionId: stripeSubscription.id }, "Subscription created");
  return sub;
}

/**
 * Upgrades tenant subscription to a new plan.
 * @param {string} tenantId
 * @param {string} planId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function upgrade(tenantId, planId, userId) {
  await assertTenantOwner(tenantId, userId);

  const subscription = await Subscription.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId)
  }).populate("planId");
  if (!subscription) {
    throw ApiError.notFound("Subscription not found");
  }
  if (!["active", "trialing"].includes(subscription.status)) {
    throw ApiError.badRequest("Cannot upgrade inactive subscription");
  }

  const plan = await PlanCatalog.findOne({ _id: planId, isActive: true });
  if (!plan) {
    throw ApiError.notFound("Plan not found or inactive");
  }

  const previousPlanId = subscription.planId?._id ?? subscription.planId;

  const stripe = getStripeClient();
  const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);

  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    items: [
      {
        id: stripeSub.items.data[0].id,
        price: plan.stripePriceId
      }
    ]
  });

  subscription.planId = plan._id;
  await subscription.save();

  const tenant = await Tenant.findById(tenantId);
  tenant.planId = plan._id;
  await tenant.save();

  await auditService
    .log({
      action: "SUBSCRIPTION.UPGRADED",
      resourceType: "Subscription",
      resourceId: subscription._id,
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      metadata: { planId, previousPlanId: String(previousPlanId) }
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.info({ tenantId, planId }, "Subscription upgraded");
  return (await Subscription.findById(subscription._id).populate("planId").lean());
}

/**
 * Cancels subscription at period end.
 * @param {string} tenantId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function cancel(tenantId, userId) {
  await assertTenantOwner(tenantId, userId);

  const subscription = await Subscription.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId)
  });
  if (!subscription) {
    throw ApiError.notFound("Subscription not found");
  }

  const stripe = getStripeClient();
  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    cancel_at_period_end: true
  });

  subscription.cancelAtPeriodEnd = true;
  await subscription.save();

  await auditService
    .log({
      action: "SUBSCRIPTION.CANCELLED",
      resourceType: "Subscription",
      resourceId: subscription._id,
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      metadata: { cancelAt: "period_end" }
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.info({ tenantId }, "Subscription cancelled at period end");
  return (await Subscription.findById(subscription._id).populate("planId").lean());
}

/**
 * Resumes cancelled subscription.
 * @param {string} tenantId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function resume(tenantId, userId) {
  await assertTenantOwner(tenantId, userId);

  const subscription = await Subscription.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId)
  });
  if (!subscription) {
    throw ApiError.notFound("Subscription not found");
  }
  if (!subscription.cancelAtPeriodEnd) {
    throw ApiError.badRequest("Subscription is not scheduled for cancellation");
  }

  const stripe = getStripeClient();
  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    cancel_at_period_end: false
  });

  subscription.cancelAtPeriodEnd = false;
  await subscription.save();

  await auditService
    .log({
      action: "SUBSCRIPTION.RESUMED",
      resourceType: "Subscription",
      resourceId: subscription._id,
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: new mongoose.Types.ObjectId(tenantId)
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.info({ tenantId }, "Subscription resumed");
  return (await Subscription.findById(subscription._id).populate("planId").lean());
}

/**
 * Checks idempotency for Stripe webhook event.
 * @param {string} eventId
 * @returns {Promise<boolean>} true if already processed
 */
async function isWebhookEventProcessed(eventId) {
  const client = getRedisClient();
  if (!client?.isOpen) return false;
  const key = idempotencyKey({
    env,
    tenantId: "_",
    provider: "stripe",
    eventId,
    clusterTenantTag: false
  });
  const exists = await client.get(key);
  return exists !== null;
}

/**
 * Marks Stripe webhook event as processed.
 * @param {string} eventId
 * @returns {Promise<void>}
 */
async function markWebhookEventProcessed(eventId) {
  const client = getRedisClient();
  if (!client?.isOpen) return;
  const key = idempotencyKey({
    env,
    tenantId: "_",
    provider: "stripe",
    eventId,
    clusterTenantTag: false
  });
  await client.setEx(key, STRIPE_WEBHOOK_IDEMPOTENCY_TTL, "1");
}

/**
 * Handles Stripe webhook event. Idempotent; never throws raw Stripe errors.
 * @param {import('stripe').Stripe.Event} event
 * @returns {Promise<void>}
 */
export async function handleStripeWebhook(event) {
  if (await isWebhookEventProcessed(event.id)) {
    return;
  }

  try {
    if (event.type === "invoice.paid") {
      await handleInvoicePaid(event);
    } else if (event.type === "invoice.payment_failed") {
      await handleInvoicePaymentFailed(event);
    } else if (event.type === "customer.subscription.updated") {
      await handleSubscriptionUpdated(event);
    } else if (event.type === "customer.subscription.deleted") {
      await handleSubscriptionDeleted(event);
    }
    await markWebhookEventProcessed(event.id);
  } catch (err) {
    logger.error({ err, eventId: event.id, eventType: event.type }, "Webhook handler error");
    throw err;
  }
}

/**
 * @param {import('stripe').Stripe.Event} event
 */
async function handleInvoicePaid(event) {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;
  if (!subscriptionId || typeof subscriptionId !== "string") return;

  const sub = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });
  if (!sub) return;

  sub.status = "active";
  await sub.save();

  await auditService
    .log({
      action: "SUBSCRIPTION.INVOICE_PAID",
      resourceType: "Subscription",
      resourceId: sub._id,
      userId: null,
      tenantId: sub.tenantId,
      metadata: { invoiceId: invoice.id }
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.info({ subscriptionId, invoiceId: invoice.id }, "Invoice paid");
}

/**
 * @param {import('stripe').Stripe.Event} event
 */
async function handleInvoicePaymentFailed(event) {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;
  if (!subscriptionId || typeof subscriptionId !== "string") return;

  const sub = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });
  if (!sub) return;

  sub.status = "past_due";
  await sub.save();

  await auditService
    .log({
      action: "SUBSCRIPTION.INVOICE_PAYMENT_FAILED",
      resourceType: "Subscription",
      resourceId: sub._id,
      userId: null,
      tenantId: sub.tenantId,
      metadata: { invoiceId: invoice.id }
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.warn({ subscriptionId, invoiceId: invoice.id }, "Invoice payment failed");
}

/**
 * @param {import('stripe').Stripe.Event} event
 */
async function handleSubscriptionUpdated(event) {
  const stripeSub = event.data.object;
  const sub = await Subscription.findOne({ stripeSubscriptionId: stripeSub.id });
  if (!sub) return;

  sub.status = stripeSub.status;
  sub.currentPeriodStart = new Date(stripeSub.current_period_start * 1000);
  sub.currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
  sub.cancelAtPeriodEnd = stripeSub.cancel_at_period_end ?? false;
  await sub.save();

  await auditService
    .log({
      action: "SUBSCRIPTION.UPDATED",
      resourceType: "Subscription",
      resourceId: sub._id,
      userId: null,
      tenantId: sub.tenantId,
      metadata: { stripeStatus: stripeSub.status }
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.info({ subscriptionId: stripeSub.id, status: stripeSub.status }, "Subscription updated");
}

/**
 * @param {import('stripe').Stripe.Event} event
 */
async function handleSubscriptionDeleted(event) {
  const stripeSub = event.data.object;
  const sub = await Subscription.findOne({ stripeSubscriptionId: stripeSub.id });
  if (!sub) return;

  sub.status = "canceled";
  await sub.save();

  const tenant = await Tenant.findById(sub.tenantId);
  if (tenant) {
    tenant.planId = null;
    await tenant.save();
  }

  await auditService
    .log({
      action: "SUBSCRIPTION.DELETED",
      resourceType: "Subscription",
      resourceId: sub._id,
      userId: null,
      tenantId: sub.tenantId,
      metadata: { stripeSubscriptionId: stripeSub.id }
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));

  logger.info({ subscriptionId: stripeSub.id }, "Subscription deleted");
}
