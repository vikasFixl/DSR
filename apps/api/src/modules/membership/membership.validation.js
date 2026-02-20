/**
 * Membership validation schemas. Zod schemas for invite, accept, update, transfer.
 */

import { z } from "zod";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/);

/**
 * Schema for GET /tenants/:tenantId/members (paginated list).
 */
export const listMembersSchema = z.object({
  params: z.object({
    tenantId: objectIdSchema,
  }),
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  }),
});

/**
 * Schema for POST /tenants/:tenantId/members/invite
 */
export const inviteMemberSchema = z.object({
  params: z.object({
    tenantId: objectIdSchema,
  }),
  body: z.object({
    email: z.string().email().toLowerCase().trim(),
    roleId: objectIdSchema,
  }),
});

/**
 * Schema for POST /tenants/:tenantId/members/accept
 */
export const acceptInviteSchema = z.object({
  params: z.object({
    tenantId: objectIdSchema,
  }),
  body: z.object({
    token: z.string().min(1, "Invite token is required"),
  }),
});

/**
 * Schema for PATCH /tenants/:tenantId/members/:userId
 */
export const updateMembershipSchema = z.object({
  params: z.object({
    tenantId: objectIdSchema,
    userId: objectIdSchema,
  }),
  body: z
    .object({
      roleId: objectIdSchema.optional(),
      teamId: objectIdSchema.nullable().optional(),
      status: z.enum(["active", "disabled"]).optional(),
    })
    .strict(),
});

/**
 * Schema for DELETE /tenants/:tenantId/members/:userId
 */
export const removeMemberSchema = z.object({
  params: z.object({
    tenantId: objectIdSchema,
    userId: objectIdSchema,
  }),
});

/**
 * Schema for POST /tenants/:tenantId/members/:userId/transfer-ownership
 */
export const transferOwnershipSchema = z.object({
  params: z.object({
    tenantId: objectIdSchema,
    userId: objectIdSchema,
  }),
});
