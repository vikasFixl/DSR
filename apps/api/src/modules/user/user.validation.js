import { z } from "zod";

const passwordSchema = z.string().min(8).max(128);

/** GET /users/me - no body */
export const getMeSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional()
});

/** PATCH /users/me */
export const updateMeSchema = z.object({
  body: z
    .object({
      name: z.string().min(1).max(120).trim().optional(),
      avatarUrl: z.string().url().max(2048).nullable().optional()
    })
    .strict(),
  params: z.object({}).optional()
});

/** POST /users/change-password */
export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema
  }),
  params: z.object({}).optional()
});

/** GET /users/sessions */
export const getSessionsSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional()
});

/** DELETE /users/sessions/:tokenId */
export const revokeSessionSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    tokenId: z.string().min(1).max(128)
  })
});
