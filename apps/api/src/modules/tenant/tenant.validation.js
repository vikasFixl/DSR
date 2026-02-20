/**
 * Tenant validation schemas. Zod schemas for tenant CRUD and settings.
 */

import { z } from "zod";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/);

/**
 * Schema for POST /tenants (create tenant).
 */
export const createTenantSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(128).trim(),
    slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric and hyphens only"),
    metadata: z.record(z.unknown()).optional(),
  }),
});

/**
 * Schema for GET /tenants/:tenantId
 */
export const getTenantSchema = z.object({
  params: z.object({
    tenantId: objectIdSchema,
  }),
});

/**
 * Schema for PATCH /tenants/:tenantId
 */
export const updateTenantSchema = z.object({
  params: z.object({
    tenantId: objectIdSchema,
  }),
  body: z
    .object({
      name: z.string().min(1).max(128).trim().optional(),
      metadata: z.record(z.unknown()).optional(),
    })
    .strict(),
});

/**
 * Schema for DELETE /tenants/:tenantId
 */
export const deleteTenantSchema = z.object({
  params: z.object({
    tenantId: objectIdSchema,
  }),
});

/**
 * Schema for GET /tenants/:tenantId/settings
 */
export const getSettingsSchema = z.object({
  params: z.object({
    tenantId: objectIdSchema,
  }),
});

/**
 * Schema for PATCH /tenants/:tenantId/settings
 */
export const updateSettingsSchema = z.object({
  params: z.object({
    tenantId: objectIdSchema,
  }),
  body: z
    .object({
      branding: z.record(z.unknown()).optional(),
      security: z.record(z.unknown()).optional(),
      notifications: z.record(z.unknown()).optional(),
    })
    .strict(),
});
