/**
 * Membership controller. No business logic; extracts req data, calls service, returns response.
 */

import * as membershipService from "#api/modules/membership/membership.service.js";

/**
 * GET /tenants/:tenantId/members - paginated list of members.
 */
export async function listMembers(req, res, next) {
  try {
    const { tenantId } = req.validated.params;
    const { page, limit } = req.validated.query;
    const result = await membershipService.listMembers(tenantId, req.user.id, {
      page,
      limit,
    });
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /tenants/:tenantId/members/invite - invite by email (owner only).
 */
export async function inviteMember(req, res, next) {
  try {
    const { tenantId } = req.validated.params;
    const { email, roleId } = req.validated.body;
    const invite = await membershipService.inviteMember(
      tenantId,
      { email, roleId },
      req.user.id,
      { ip: req.ip, userAgent: req.get("user-agent") }
    );
    return res.status(201).json(invite);
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /tenants/:tenantId/members/accept - accept invite with token.
 */
export async function acceptInvite(req, res, next) {
  try {
    const { tenantId } = req.validated.params;
    const { token } = req.validated.body;
    const result = await membershipService.acceptInvite(
      tenantId,
      token,
      req.user.id,
      { ip: req.ip, userAgent: req.get("user-agent") }
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /tenants/:tenantId/members/:userId - update role/team/status (owner only).
 */
export async function updateMembership(req, res, next) {
  try {
    const { tenantId, userId: targetUserId } = req.validated.params;
    const { body } = req.validated;
    const membership = await membershipService.updateMembership(
      tenantId,
      targetUserId,
      body,
      req.user.id,
      { ip: req.ip, userAgent: req.get("user-agent") }
    );
    return res.status(200).json(membership);
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /tenants/:tenantId/members/:userId - remove member (owner only).
 */
export async function removeMember(req, res, next) {
  try {
    const { tenantId, userId: targetUserId } = req.validated.params;
    await membershipService.removeMember(
      tenantId,
      targetUserId,
      req.user.id,
      { ip: req.ip, userAgent: req.get("user-agent") }
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /tenants/:tenantId/members/:userId/transfer-ownership - transfer owner (owner only).
 */
export async function transferOwnership(req, res, next) {
  try {
    const { tenantId, userId: newOwnerUserId } = req.validated.params;
    const result = await membershipService.transferOwnership(
      tenantId,
      newOwnerUserId,
      req.user.id,
      { ip: req.ip, userAgent: req.get("user-agent") }
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}
