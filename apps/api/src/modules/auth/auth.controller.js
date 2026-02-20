import * as authService from "#api/modules/auth/auth.service.js";
import { setAccessCookie, setRefreshCookie, clearAuthCookies, getRefreshTokenFromCookies } from "#api/modules/auth/auth.cookies.js";
/**
 * POST /auth/signup - create account, send verification email.
 */
export async function signup(req, res, next) {
  try {
    const { body } = req.validated;
    const result = await authService.signup(body);
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /auth/verify-email - verify with OTP.
 */
export async function verifyEmail(req, res, next) {
  try {
    const { body } = req.validated;
    const result = await authService.verifyEmail(body);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /auth/resend-verification - resend OTP.
 */
export async function resendVerification(req, res, next) {
  try {
    const { body } = req.validated;
    const result = await authService.resendVerification(body);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /auth/login - set httpOnly cookies, return user profile only (no tokens in body).
 */
export async function login(req, res, next) {
  try {
    const { body } = req.validated;
    const meta = { ip: req.ip, userAgent: req.get("user-agent") };
    const { user, accessToken, refreshToken } = await authService.login(body, meta);
   
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);
    return res.status(200).json({ user,accessToken,refreshToken});
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /auth/refresh - rotate refresh token, set new cookies, return 200 (no body or empty).
 */
export async function refresh(req, res, next) {
  try {
    const refreshToken = getRefreshTokenFromCookies(req);
    const meta = { ip: req.ip, userAgent: req.get("user-agent") };
    const { accessToken, refreshToken: newRefreshToken } = await authService.refresh(refreshToken, meta);
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, newRefreshToken);
    return res.status(200).json({});
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /auth/logout - revoke session, clear cookies.
 */
export async function logout(req, res, next) {
  try {
    const refreshToken = getRefreshTokenFromCookies(req);
    await authService.logout(refreshToken);
    clearAuthCookies(res);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /auth/logout-all - revoke all sessions, clear cookies.
 */
export async function logoutAll(req, res, next) {
  try {
    const refreshToken = getRefreshTokenFromCookies(req);
    await authService.logoutAll(refreshToken);
    clearAuthCookies(res);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /auth/forgot-password - send reset link.
 */
export async function forgotPassword(req, res, next) {
  try {
    const { body } = req.validated;
    const result = await authService.forgotPassword(body);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /auth/reset-password - set new password, revoke sessions.
 */
export async function resetPassword(req, res, next) {
  try {
    const { body } = req.validated;
    const result = await authService.resetPassword(body);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}
