import { z } from "zod";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/);

export const listNotificationsSchema = z.object({
  query: z
    .object({
      tenantId: objectIdSchema.optional(),
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      unreadOnly: z
        .string()
        .optional()
        .transform((v) => (v === "true" || v === "1" ? true : v === "false" || v === "0" ? false : undefined))
    })
    .optional()
});

export const getUnreadCountSchema = z.object({
  query: z
    .object({
      tenantId: objectIdSchema.optional()
    })
    .optional()
});

export const markAsReadSchema = z.object({
  params: z.object({
    id: objectIdSchema
  }),
  query: z
    .object({
      tenantId: objectIdSchema.optional()
    })
    .optional()
});
