/**
 * MFA Routes using speakeasy
 */

import { Router } from 'express';
import { validate } from '#api/middlewares/validate.middleware.js';
import { authenticate } from '#api/middlewares/auth.middleware.js';
import * as mfaController from './mfa.controller.js';
import { mfaValidation } from './mfa.validation.js';

const router = Router();

// Public routes (no authentication required)
router.post('/verify', validate(mfaValidation.verifyMFA), mfaController.verifyMFA);

// Protected routes (authentication required)
router.post('/setup', authenticate(), validate(mfaValidation.setupTOTP), mfaController.setupTOTP);
router.post('/verify-setup', authenticate(), validate(mfaValidation.verifySetup), mfaController.verifyTOTPSetup);
router.post('/disable', authenticate(), validate(mfaValidation.disableMFA), mfaController.disableMFA);
router.get('/status', authenticate(), mfaController.getMFAStatus);
router.post('/backup-codes/regenerate', authenticate(), validate(mfaValidation.regenerateBackupCodes), mfaController.regenerateBackupCodes);

export default router;
