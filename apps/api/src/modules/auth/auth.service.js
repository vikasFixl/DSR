import crypto, { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { User, UserSession } from "#db/models/index.js";
import { ApiError } from "#api/utils/ApiError.js";
import * as auditService from "#api/modules/audit/audit.service.js";
import { logger } from "#api/utils/logger.js";
import { config } from "#api/config/env.js";
import { authRedisKeys } from "#api/modules/auth/auth.redis.js";
import { getRedisClient } from "#infra/cache/redis.js";
import { enqueueVerifyEmailOtp, enqueueForgotPasswordEmail } from "#infra/queue/email.queue.js";
import {
  setVerifyEmailOtp,
  getVerifyEmailOtp,
  deleteVerifyEmailOtp,
  incrementVerifyOtpAttempts,
  clearVerifyOtpAttempts,
  setVerifyOtpLock,
  isVerifyOtpLocked,
  setRefreshRecord,
  getRefreshRecord,
  deleteRefreshRecord,
  addUserRefreshId,
  removeUserRefreshId,
  getUserRefreshIds,
  clearUserRefreshSet,
  deleteManyRefreshRecords,
  setPasswordResetToken,
  getPasswordResetUserId,
  deletePasswordResetToken,
  incrementLoginRateLimit,
  incrementOtpSendRateLimit
} from "#api/modules/auth/auth.redis.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken, compareHashedToken } from "#api/modules/auth/auth.tokens.js";

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 min
const LOGIN_RATE_LIMIT_COUNT = 10;
const LOGIN_RATE_LIMIT_TTL_SEC = 15 * 60; // 15 min
const OTP_SEND_RATE_LIMIT_COUNT = 5;
const OTP_SEND_RATE_LIMIT_TTL_SEC = 10 * 60; // 10 min
const OTP_ATTEMPTS_MAX = 5;
const REFRESH_TTL_DAYS = 7;
const ACCESS_TOKEN_TTL_SEC=15

/**
 * Normalizes email to lowercase and trims.
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

/**
 * Generates a 6-digit numeric OTP.
 * @returns {string}
 */
function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

/**
 * @param {string} password
 * @returns {Promise<string>}
 */
async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Signup: create user, store hashed OTP, send verification email.
 * @param {{ email: string, password: string, name: string }} input
 * @returns {Promise<{ message: string }>}
 */

export async function signup(input) {
  const email = normalizeEmail(input.email);
  const existing = await User.findOne({ email }).lean();
  if (existing) {
    throw ApiError.badRequest("An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await User.create({
    email,
    name: input.name.trim(),
    auth: { passwordHash, passwordAlgo: "bcrypt" },
    emailVerified: false,
    status: "active"
  });

  const otp = generateOtp();
  const otpHash = hashToken(otp);
  await setVerifyEmailOtp(String(user._id), otpHash);

  await enqueueVerifyEmailOtp({ to: email, name: user.name, otp, purpose: "email verification" });
  await auditService
    .log({
      action: "AUTH.SIGNUP",
      resourceType: "User",
      resourceId: user._id,
      userId: user._id,
      tenantId: null,
      ip: null,
      userAgent: null,
      metadata: { email }
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));
  logger.info({ userId: user._id, email }, "Signup completed, verification email queued");
  return { message: "Account created. Please verify your email." };
}

/**
 * Verify email with OTP; lock after 5 failed attempts.
 * @param {{ email: string, otp: string }} input
 * @returns {Promise<{ message: string }>}
 */
export async function verifyEmail(input) {
  const email = normalizeEmail(input.email);
  const user = await User.findOne({ email }).lean();
  if (!user) {
    throw ApiError.badRequest("Invalid credentials");
  }

  const userId = String(user._id);
  if (await isVerifyOtpLocked(userId)) {
    throw ApiError.badRequest("Too many attempts. Try again later.");
  }

  const attempts = await incrementVerifyOtpAttempts(userId);
  if (attempts > OTP_ATTEMPTS_MAX) {
    await setVerifyOtpLock(userId);
    throw ApiError.badRequest("Too many attempts. Try again later.");
  }

  const record = await getVerifyEmailOtp(userId);
  if (!record || !compareHashedToken(input.otp, record.otpHash)) {
    throw ApiError.badRequest("Invalid credentials");
  }

  await deleteVerifyEmailOtp(userId);
  await clearVerifyOtpAttempts(userId);
  await User.updateOne({ _id: user._id }, { $set: { emailVerified: true } });
  logger.info({ userId: user._id, email }, "Email verified");
  return { message: "Email verified successfully." };
}

/**
 * Resend verification OTP; rate limited by email.
 * @param {{ email: string }} input
 * @returns {Promise<{ message: string }>}
 */
export async function resendVerification(input) {
  const email = normalizeEmail(input.email);
  const count = await incrementOtpSendRateLimit(email, OTP_SEND_RATE_LIMIT_TTL_SEC);
  if (count > OTP_SEND_RATE_LIMIT_COUNT) {
    throw ApiError.badRequest("Too many requests. Try again later.");
  }

  const user = await User.findOne({ email }).lean();
  if (!user) {
    return { message: "If an account exists, a new verification code was sent." };
  }
  if (user.emailVerified) {
    return { message: "Email is already verified." };
  }

  const otp = generateOtp();
  const otpHash = hashToken(otp);
  await setVerifyEmailOtp(String(user._id), otpHash);
  await enqueueVerifyEmailOtp({ to: email, name: user.name, otp, purpose: "email verification" });
  logger.info({ userId: user._id, email }, "Verification OTP resent");
  return { message: "If an account exists, a new verification code was sent." };
}


export async function login(input, meta) {
  const redis= await getRedisClient();
  const ip = meta?.ip ?? "unknown";
  const userAgent = meta?.userAgent ?? "unknown";
  const now = new Date();
  const deviceId = crypto
  .createHash("sha256")
  .update((meta?.userAgent ?? "") + (ip ?? "") + Date.now())
  .digest("hex");

  const email = normalizeEmail(input.email);
  const user = await User.findOne({ email }).lean();

  // 🔒 Always generic error
  if (!user) {
    throw ApiError.badRequest("Invalid credentials");
  }

  if (user.status !== "active" || !user.emailVerified) {
    throw ApiError.badRequest("Invalid credentials");
  }

  // 🔒 LOCK CHECK BEFORE PASSWORD VERIFY
  if (user.lockedUntil && new Date(user.lockedUntil) > now) {
    throw ApiError.badRequest("Invalid credentials");
  }

  const passwordHash = user.auth?.passwordHash ?? user.passwordHash;
  if (!passwordHash) {
    throw ApiError.badRequest("Invalid credentials");
  }

  const valid = await verifyPassword(input.password, passwordHash);

  if (!valid) {
    const newAttempts = (user.failedLoginAttempts ?? 0) + 1;
    const update = { $inc: { failedLoginAttempts: 1 } };

    if (newAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      update.$set = { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) };
    }

    await User.updateOne({ _id: user._id }, update).catch(() => {});
    throw ApiError.badRequest("Invalid credentials");
  }

  // 🔥 SUCCESS PATH

  const sessionId = crypto.randomUUID();
  const refreshId = crypto.randomUUID();
  const jti = crypto.randomUUID();

  const accessToken = signAccessToken({
    sub: String(user._id),
    sessionId,
    jti
  });

  const refreshToken = signRefreshToken({
    sub: String(user._id),
    refreshId,
    sessionId
  });

  const refreshHash = hashToken(refreshToken);

  const accessTTL = ACCESS_TOKEN_TTL_SEC *60 // 15 min default if not set in config
  const refreshTTL = REFRESH_TTL_DAYS * 24 * 60 * 60;



const expiresAt = new Date(Date.now() + refreshTTL * 1000);

// 1️⃣ Check existing session
const existingSession = await UserSession.findOne({ sessionId }).lean();

if (existingSession) {
  // Update existing session
  await UserSession.updateOne(
    { sessionId },
    {
      $set: {
        refreshTokenHash: refreshHash,
        ip,
        userAgent,
        expiresAt,
        revokedAt: null
      }
    }
  );
} else {
  // Create new session
  await UserSession.create({
    sessionId,
    userId: user._id,
    refreshTokenHash: refreshHash,
    deviceId,
    userAgent,
    ip,
    expiresAt,
    revokedAt: null
  });
}

const fingerprint = userAgent + ip

// Runtime session
await redis.set(
  authRedisKeys.session(sessionId),
  JSON.stringify({
    userId: String(user._id),
    fingerprint
  }),
  "EX",
  accessTTL
);

// Refresh record
await redis.set(
  authRedisKeys.refresh(refreshId),
  JSON.stringify({
    userId: String(user._id),
    sessionId,
    tokenHash: refreshHash
  }),
  "EX",
  refreshTTL
);

  // 🔹 Reset failure state
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        "auth.lastLoginAt": now,
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    }
  );

  return {
    user: {
      id: user._id,
      email: user.email,
      name: user.name
    },
    accessToken,
    refreshToken
  };
}
/**
 * Refresh: validate refresh cookie, rotate token, update session, return new tokens (caller sets cookies).
 * @param {string} refreshTokenFromCookie
 * @param {{ ip: string, userAgent: string }} meta
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
export async function refresh(refreshTokenFromCookie, meta) {
  if (!refreshTokenFromCookie) {
    throw ApiError.unauthorized("Unauthorized");
  }

  const payload = verifyRefreshToken(refreshTokenFromCookie);
  const userId = payload.sub;
  const refreshId = payload.refreshId;

  const record = await getRefreshRecord(refreshId);
  if (!record) {
    await revokeAllSessionsForUser(userId);
    throw ApiError.unauthorized("Unauthorized");
  }

  if (record.userId !== userId) {
    await revokeAllSessionsForUser(userId);
    throw ApiError.unauthorized("Unauthorized");
  }

  if (!compareHashedToken(refreshTokenFromCookie, record.tokenHash)) {
    await revokeAllSessionsForUser(userId);
    logger.warn({ userId }, "Refresh token hash mismatch, revoked all sessions");
    throw ApiError.unauthorized("Unauthorized");
  }

  await deleteRefreshRecord(refreshId);
  await removeUserRefreshId(userId, refreshId);

  const newRefreshId = crypto.randomUUID();
  const newTokenId = crypto.randomUUID();
  const newJti = crypto.randomUUID();
  const newRefreshToken = signRefreshToken({ userId, refreshId: newRefreshId });
  const newRefreshHash = hashToken(newRefreshToken);
  const accessToken = signAccessToken({ userId, tokenId: newTokenId, jti: newJti });

  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  await setRefreshRecord(newRefreshId, {
    userId,
    tokenHash: newRefreshHash,
    sessionTokenId: newTokenId,
    deviceId: record.deviceId
  });
  await addUserRefreshId(userId, newRefreshId);

  await UserSession.updateOne(
    { userId, tokenId: record.sessionTokenId },
    {
      $set: {
        tokenId: newTokenId,
        refreshTokenHash: newRefreshHash,
        expiresAt,
        userAgent: meta?.userAgent ?? null,
        ip: meta?.ip ?? null
      }
    }
  ).catch(() => {});

  logger.info({ userId }, "Refresh token rotated");
  return { accessToken, refreshToken: newRefreshToken };
}

/**
 * Revokes all refresh sessions for a user (Redis + DB).
 * @param {string} userId
 * @returns {Promise<void>}
 */
async function revokeAllSessionsForUser(userId) {
  const refreshIds = await getUserRefreshIds(userId);
  await deleteManyRefreshRecords(refreshIds);
  await clearUserRefreshSet(userId);
  await UserSession.updateMany(
    { userId },
    { $set: { revokedAt: new Date() } }
  ).catch(() => {});
}

/**
 * Logout: invalidate single session, clear cookies.
 * @param {string | undefined} refreshTokenFromCookie
 * @returns {Promise<void>}
 */
export async function logout(refreshTokenFromCookie) {
  if (!refreshTokenFromCookie) {
    return;
  }

  let userIdForAudit = null;
  try {
    const payload = verifyRefreshToken(refreshTokenFromCookie);
    const refreshId = payload.refreshId;
    const record = await getRefreshRecord(refreshId);
    if (record) {
      userIdForAudit = record.userId;
      await deleteRefreshRecord(refreshId);
      await removeUserRefreshId(record.userId, refreshId);
      await UserSession.updateOne(
        { userId: record.userId, tokenId: record.sessionTokenId },
        { $set: { revokedAt: new Date() } }
      ).catch(() => {});
    }
  } catch {
    // ignore invalid token
  }
  if (userIdForAudit) {
    await auditService
      .log({
        action: "AUTH.LOGOUT",
        resourceType: "UserSession",
        resourceId: null,
        userId: userIdForAudit,
        tenantId: null,
        metadata: {}
      })
      .catch((err) => logger.warn({ err }, "Audit log failed"));
  }
  logger.info("Logout completed");
}

/**
 * Logout all: revoke all sessions for the user identified by refresh cookie, clear cookies.
 * @param {string | undefined} refreshTokenFromCookie
 * @returns {Promise<void>}
 */
export async function logoutAll(refreshTokenFromCookie) {
  if (!refreshTokenFromCookie) {
    return;
  }

  try {
    const payload = verifyRefreshToken(refreshTokenFromCookie);
    await revokeAllSessionsForUser(payload.sub);
    await auditService
      .log({
        action: "AUTH.LOGOUT_ALL",
        resourceType: "UserSession",
        resourceId: null,
        userId: payload.sub,
        tenantId: null,
        metadata: {}
      })
      .catch((err) => logger.warn({ err }, "Audit log failed"));
    logger.info({ userId: payload.sub }, "Logout all completed");
  } catch {
    // ignore
  }
}

/**
 * Forgot password: issue reset token in Redis, send email.
 * @param {{ email: string }} input
 * @returns {Promise<{ message: string }>}
 */
export async function forgotPassword(input) {
  const email = normalizeEmail(input.email);
  const user = await User.findOne({ email }).lean();
  if (!user) {
    return { message: "If an account exists, a password reset link was sent." };
  }

  const token = crypto.randomBytes(32).toString("hex");
  await setPasswordResetToken(token, String(user._id));
  const resetLink = `${config.app.publicUrl}/reset-password?token=${token}`;
  await enqueueForgotPasswordEmail({ to: email, name: user.name, resetLink });
  await auditService
    .log({
      action: "AUTH.PASSWORD_RESET_REQUEST",
      resourceType: "User",
      resourceId: user._id,
      userId: user._id,
      tenantId: null,
      metadata: { email }
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));
  logger.info({ userId: user._id, email }, "Password reset requested");
  return { message: "If an account exists, a password reset link was sent." };
}

/**
 * Reset password: validate token, update password, revoke all sessions.
 * @param {{ token: string, newPassword: string }} input
 * @returns {Promise<{ message: string }>}
 */
export async function resetPassword(input) {
  const userId = await getPasswordResetUserId(input.token);
  if (!userId) {
    throw ApiError.badRequest("Invalid or expired reset link");
  }

  const user = await User.findById(userId).lean();
  if (!user) {
    throw ApiError.badRequest("Invalid or expired reset link");
  }

  const passwordHash = await hashPassword(input.newPassword);
  const now = new Date();
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        "auth.passwordHash": passwordHash,
        passwordChangedAt: now
      }
    }
  );
  await deletePasswordResetToken(input.token);
  await revokeAllSessionsForUser(userId);
  await auditService
    .log({
      action: "AUTH.PASSWORD_RESET",
      resourceType: "User",
      resourceId: userId,
      userId,
      tenantId: null,
      metadata: {}
    })
    .catch((err) => logger.warn({ err }, "Audit log failed"));
  logger.info({ userId }, "Password reset completed");
  return { message: "Password has been reset successfully." };
}
