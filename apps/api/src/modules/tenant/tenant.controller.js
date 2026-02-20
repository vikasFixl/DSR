/**
 * Tenant controller. No business logic; extracts req data, calls service, returns response.
 */

import * as tenantService from "#api/modules/tenant/tenant.service.js";

/**
 * POST /tenants - create tenant (auth required).
 */
export async function createTenant(req, res, next) {
  try {
    const { body } = req.validated;
    const tenant = await tenantService.createTenant(body, req.user.id, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
    return res.status(201).json(tenant);
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /tenants/:tenantId - get tenant details (membership required).
 */
export async function getTenant(req, res, next) {
  try {
    const { tenantId } = req.validated.params;
    const tenant = await tenantService.getTenant(tenantId, req.user.id);
    return res.status(200).json(tenant);
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /tenants/:tenantId - update tenant (owner only).
 */
export async function updateTenant(req, res, next) {
  try {
    const { tenantId } = req.validated.params;
    const { body } = req.validated;
    const tenant = await tenantService.updateTenant(tenantId, req.user.id, body, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
    return res.status(200).json(tenant);
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /tenants/:tenantId - soft suspend tenant (owner only).
 */
export async function deleteTenant(req, res, next) {
  try {
    const { tenantId } = req.validated.params;
    const tenant = await tenantService.suspendTenant(tenantId, req.user.id, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
    return res.status(200).json(tenant);
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /tenants/:tenantId/settings - get structured settings.
 */
export async function getSettings(req, res, next) {
  try {
    const { tenantId } = req.validated.params;
    const settings = await tenantService.getSettings(tenantId, req.user.id);
    return res.status(200).json(settings);
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /tenants/:tenantId/settings - update settings (owner only).
 */
export async function updateSettings(req, res, next) {
  try {
    const { tenantId } = req.validated.params;
    const { body } = req.validated;
    const settings = await tenantService.updateSettings(tenantId, req.user.id, body, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
    return res.status(200).json(settings);
  } catch (error) {
    return next(error);
  }
}
