/**
 * MFA Controller
 * Handles HTTP requests for MFA operations using speakeasy
 */

import * as mfaService from './mfa.service.speakeasy.js';
import { ApiError } from '#api/utils/ApiError.js';

/**
 * POST /auth/mfa/setup
 * Initiate TOTP setup
 */
export async function setupTOTP(req, res, next) {
  try {
    const { userId, tenantId } = req.user;
    const { deviceName } = req.body;
    const meta = { ip: req.ip, userAgent: req.get('user-agent') };
    
    const result = await mfaService.setupTOTP({
      userId,
      tenantId,
      email: req.user.email,
      deviceName,
      meta
    });
    
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /auth/mfa/verify-setup
 * Verify TOTP setup with code
 */
export async function verifyTOTPSetup(req, res, next) {
  try {
    const { userId, tenantId } = req.user;
    const { code } = req.body;
    const meta = { ip: req.ip, userAgent: req.get('user-agent') };
    
    const result = await mfaService.verifyTOTPSetup({
      userId,
      tenantId,
      code,
      meta
    });
    
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /auth/mfa/verify
 * Verify MFA code during login
 */
export async function verifyMFA(req, res, next) {
  try {
    const { challengeId, code } = req.body;
    const meta = { ip: req.ip, userAgent: req.get('user-agent') };
    
    const result = await mfaService.verifyMFACode({
      challengeId,
      code,
      meta
    });
    
    // Import auth service to issue tokens
    const { signAccessToken, signRefreshToken } = await import('./auth.tokens.js');
    const { setAccessCookie, setRefreshCookie } = await import('./auth.cookies.js');
    const { hashToken } = await import('./auth.tokens.js');
    const { setRefreshRecord, addUserRefreshId } = await import('./auth.redis.js');
    const crypto = await import('node:crypto');
    
    // Issue tokens with mfaVerified flag
    const refreshId = crypto.randomUUID();
    const tokenId = crypto.randomUUID();
    const jti = crypto.randomUUID();
    
    const accessToken = signAccessToken({
      userId: result.userId,
      tokenId,
      jti,
      mfaVerified: true // CRITICAL: Mark session as MFA verified
    });
    
    const refreshToken = signRefreshToken({
      userId: result.userId,
      refreshId,
      mfaVerified: true
    });
    
    const refreshHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await setRefreshRecord(refreshId, {
      userId: result.userId,
      tokenHash: refreshHash,
      sessionTokenId: tokenId,
      deviceId: tokenId,
      mfaVerified: true
    });
    
    await addUserRefreshId(result.userId, refreshId);
    
    // Set cookies
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);
    
    return res.status(200).json({
      success: true,
      method: result.method,
      accessToken,
      refreshToken,
      ...(result.remainingBackupCodes !== undefined && {
        remainingBackupCodes: result.remainingBackupCodes
      })
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /auth/mfa/disable
 * Disable MFA (requires password + MFA code)
 */
export async function disableMFA(req, res, next) {
  try {
    const { userId, tenantId } = req.user;
    const { password, mfaCode } = req.body;
    const meta = { ip: req.ip, userAgent: req.get('user-agent') };
    
    const result = await mfaService.disableMFA({
      userId,
      tenantId,
      password,
      mfaCode,
      meta
    });
    
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /auth/mfa/status
 * Get MFA status for current user
 */
export async function getMFAStatus(req, res, next) {
  try {
    const { userId, tenantId } = req.user;
    
    const status = await mfaService.getMFAStatus({
      userId,
      tenantId
    });
    
    return res.status(200).json(status);
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /auth/mfa/backup-codes/regenerate
 * Regenerate backup codes
 */
export async function regenerateBackupCodes(req, res, next) {
  try {
    const { userId, tenantId } = req.user;
    const { mfaCode } = req.body;
    const meta = { ip: req.ip, userAgent: req.get('user-agent') };
    
    const result = await mfaService.regenerateBackupCodes({
      userId,
      tenantId,
      mfaCode,
      meta
    });
    
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}
