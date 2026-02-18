import { z } from "zod";

const emailSchema = z.string().email().max(255).transform((v) => v.trim().toLowerCase());
const passwordSchema = z.string().min(8).max(128);
const otpSchema = z.string().length(6).regex(/^\d{6}$/);
const deviceIdSchema = z.string().min(1).max(256).optional();

/** POST /auth/signup */
export const signupSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string().min(1).max(120).trim()
  })
});

/** POST /auth/verify-email */
export const verifyEmailSchema = z.object({
  body: z.object({
    email: emailSchema,
    otp: otpSchema
  })
});

/** POST /auth/resend-verification */
export const resendVerificationSchema = z.object({
  body: z.object({
    email: emailSchema
  })
});

/** POST /auth/login */
export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: passwordSchema,
    deviceId: deviceIdSchema
  })
});

/** POST /auth/refresh - no body, cookie only */
export const refreshSchema = z.object({
  body: z.object({}).strict()
});

/** POST /auth/logout - no body */
export const logoutSchema = z.object({
  body: z.object({}).strict().optional()
});

/** POST /auth/logout-all */
export const logoutAllSchema = z.object({
  body: z.object({}).strict().optional()
});

/** POST /auth/forgot-password */
export const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailSchema
  })
});

/** POST /auth/reset-password */
export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1),
    newPassword: passwordSchema
  })
});
