/**
 * MFA Validation Schemas using Zod
 */

import { z } from 'zod';

export const mfaValidation = {
  setupTOTP: {
    body: z.object({
      deviceName: z.string().trim().min(1).max(100).optional()
    })
  },
  
  verifySetup: {
    body: z.object({
      code: z.string().trim().regex(/^\d{6}$/, 'Code must be 6 digits')
    })
  },
  
  verifyMFA: {
    body: z.object({
      challengeId: z.string().uuid('Invalid challenge ID'),
      code: z.string().trim().min(6).max(20) // Support both TOTP (6 digits) and backup codes
    })
  },
  
  disableMFA: {
    body: z.object({
      password: z.string().min(8),
      mfaCode: z.string().trim().regex(/^\d{6}$/, 'MFA code must be 6 digits')
    })
  },
  
  regenerateBackupCodes: {
    body: z.object({
      mfaCode: z.string().trim().regex(/^\d{6}$/, 'MFA code must be 6 digits')
    })
  }
};
