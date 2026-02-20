/**
 * Membership routes. Mount under /tenants/:tenantId so paths are /tenants/:tenantId/members, etc.
 */

import { Router } from "express";
import { validate } from "#api/middlewares/validate.middleware.js";
import { authenticate } from "#api/middlewares/auth.middleware.js";
import {
  requireTenantMembership,
  requireTenantOwner,
} from "#api/middlewares/requireTenantMembership.js";
import {
  listMembersSchema,
  inviteMemberSchema,
  acceptInviteSchema,
  updateMembershipSchema,
  removeMemberSchema,
  transferOwnershipSchema,
} from "#api/modules/membership/membership.validation.js";
import * as membershipController from "#api/modules/membership/membership.controller.js";

/**
 * @param {{ membershipController: typeof membershipController }} deps
 * @returns {import("express").Router}
 */
export const createMembershipRoutes = ({ membershipController }) => {
  const router = Router({ mergeParams: true });

  router.use(authenticate());

  router.get(
    "/members",
    validate(listMembersSchema),
    requireTenantMembership(),
    membershipController.listMembers
  );

  router.post(
    "/members/invite",
    validate(inviteMemberSchema),
    requireTenantMembership(),
    requireTenantOwner(),
    membershipController.inviteMember
  );

  router.post(
    "/members/accept",
    validate(acceptInviteSchema),
    membershipController.acceptInvite
  );

  router.patch(
    "/members/:userId",
    validate(updateMembershipSchema),
    requireTenantMembership(),
    requireTenantOwner(),
    membershipController.updateMembership
  );

  router.delete(
    "/members/:userId",
    validate(removeMemberSchema),
    requireTenantMembership(),
    requireTenantOwner(),
    membershipController.removeMember
  );

  router.post(
    "/members/:userId/transfer-ownership",
    validate(transferOwnershipSchema),
    requireTenantMembership(),
    requireTenantOwner(),
    membershipController.transferOwnership
  );

  return router;
};
