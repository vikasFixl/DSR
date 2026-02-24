import { config } from "#api/config/env.js";
import { ApiError } from "#api/utils/ApiError.js";
import { getRedisClient } from "#infra/cache/redis.js";

const OTP_TTL_SECONDS = 10 * 60;
const OTP_ATTEMPTS_TTL_SECONDS = 10 * 60;
const OTP_LOCK_TTL_SECONDS = 10 * 60;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
const PASSWORD_RESET_TTL_SECONDS = 15 * 60;

/**
 * Ensures Redis is available before command execution.
 * @returns {import("redis").RedisClientType}
 */
const requireRedisClient = () => {
  const redis = getRedisClient();
  if (!redis) {
    throw ApiError.serviceUnavailable("Cache service unavailable");
  }
  return redis;
};

/**
 * Builds a Redis key using required global format.
 * @param {string} module
 * @param {string} type
 * @param {string} identifier
 * @returns {string}
 */
const buildGlobalKey = (module, type, identifier) => {
  const env = config.app.env;
  return `${env}:global:${module}:${type}:${identifier}`;
};

/**
 * Centralized Redis key builder for auth module.
 */
export const authRedisKeys = Object.freeze({
  otpVerifyEmail: (userId) => buildGlobalKey("otp", "verifyEmail", userId),
  otpAttemptsVerifyEmail: (userId) => buildGlobalKey("otp_attempts", "verifyEmail", userId),
  otpLockVerifyEmail: (userId) => buildGlobalKey("otp_lock", "verifyEmail", userId),
  refresh: (refreshId) => buildGlobalKey("auth", "refresh", refreshId),
  userRefreshSet: (userId) => buildGlobalKey("auth", "user_refresh_set", userId),
  passwordReset: (token) => buildGlobalKey("auth", "pwdreset", token),
  rateLoginIp: (ip) => buildGlobalKey("rate", "ip", `${ip}:login`),
  rateOtpSend: (email) => buildGlobalKey("rate", "otp_send", email),
  session: (sessionId) => buildGlobalKey("auth", "session", sessionId),
  sessionRevoked: (sessionId) => buildGlobalKey("auth", "session_revoked", sessionId)
});

/**
 * Stores hashed OTP for email verification.
 * @param {string} userId
 * @param {string} otpHash
 * @returns {Promise<void>}
 */
export const setVerifyEmailOtp = async (userId, otpHash) => {
  const redis = requireRedisClient();
  const key = authRedisKeys.otpVerifyEmail(userId);
  await redis.setEx(key, OTP_TTL_SECONDS, JSON.stringify({ otpHash }));
};

/**
 * Reads hashed OTP for email verification.
 * @param {string} userId
 * @returns {Promise<{ otpHash: string } | null>}
 */
export const getVerifyEmailOtp = async (userId) => {
  const redis = requireRedisClient();
  const key = authRedisKeys.otpVerifyEmail(userId);
  const raw = await redis.get(key);
  if (!raw) return null;
  return JSON.parse(raw);
};

/**
 * Deletes OTP verification record.
 * @param {string} userId
 * @returns {Promise<void>}
 */
export const deleteVerifyEmailOtp = async (userId) => {
  const redis = requireRedisClient();
  await redis.del(authRedisKeys.otpVerifyEmail(userId));
};

/**
 * Increments OTP attempt count and sets TTL.
 * @param {string} userId
 * @returns {Promise<number>}
 */
export const incrementVerifyOtpAttempts = async (userId) => {
  const redis = requireRedisClient();
  const key = authRedisKeys.otpAttemptsVerifyEmail(userId);
  const attempts = await redis.incr(key);
  if (attempts === 1) {
    await redis.expire(key, OTP_ATTEMPTS_TTL_SECONDS);
  }
  return attempts;
};

/**
 * Clears OTP attempts counter.
 * @param {string} userId
 * @returns {Promise<void>}
 */
export const clearVerifyOtpAttempts = async (userId) => {
  const redis = requireRedisClient();
  await redis.del(authRedisKeys.otpAttemptsVerifyEmail(userId));
};

/**
 * Sets OTP verification lock.
 * @param {string} userId
 * @returns {Promise<void>}
 */
export const setVerifyOtpLock = async (userId) => {
  const redis = requireRedisClient();
  await redis.setEx(authRedisKeys.otpLockVerifyEmail(userId), OTP_LOCK_TTL_SECONDS, "1");
};

/**
 * Checks if OTP verification is locked.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const isVerifyOtpLocked = async (userId) => {
  const redis = requireRedisClient();
  const value = await redis.get(authRedisKeys.otpLockVerifyEmail(userId));
  return Boolean(value);
};

/**
 * Clears OTP lock state.
 * @param {string} userId
 * @returns {Promise<void>}
 */
export const clearVerifyOtpLock = async (userId) => {
  const redis = requireRedisClient();
  await redis.del(authRedisKeys.otpLockVerifyEmail(userId));
};

/**
 * Stores hashed refresh token record.
 * @param {string} refreshId
 * @param {{ userId: string, tokenHash: string, sessionTokenId: string, deviceId: string }} payload
 * @returns {Promise<void>}
 */
export const setRefreshRecord = async (refreshId, payload) => {
  const redis = requireRedisClient();
  const key = authRedisKeys.refresh(refreshId);
  await redis.setEx(key, REFRESH_TTL_SECONDS, JSON.stringify(payload));
};

/**
 * Fetches refresh token record by id.
 * @param {string} refreshId
 * @returns {Promise<{ userId: string, tokenHash: string, sessionTokenId: string, deviceId: string } | null>}
 */
export const getRefreshRecord = async (refreshId) => {
  const redis = requireRedisClient();
  const raw = await redis.get(authRedisKeys.refresh(refreshId));
  if (!raw) return null;
  return JSON.parse(raw);
};

/**
 * Deletes refresh token record by id.
 * @param {string} refreshId
 * @returns {Promise<void>}
 */
export const deleteRefreshRecord = async (refreshId) => {
  const redis = requireRedisClient();
  await redis.del(authRedisKeys.refresh(refreshId));
};

/**
 * Adds refresh id into user refresh-id set.
 * @param {string} userId
 * @param {string} refreshId
 * @returns {Promise<void>}
 */
export const addUserRefreshId = async (userId, refreshId) => {
  const redis = requireRedisClient();
  await redis.sAdd(authRedisKeys.userRefreshSet(userId), refreshId);
};

/**
 * Removes refresh id from user refresh-id set.
 * @param {string} userId
 * @param {string} refreshId
 * @returns {Promise<void>}
 */
export const removeUserRefreshId = async (userId, refreshId) => {
  const redis = requireRedisClient();
  await redis.sRem(authRedisKeys.userRefreshSet(userId), refreshId);
};

/**
 * Lists all refresh ids for user.
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export const getUserRefreshIds = async (userId) => {
  const redis = requireRedisClient();
  return redis.sMembers(authRedisKeys.userRefreshSet(userId));
};

/**
 * Clears user refresh-id set.
 * @param {string} userId
 * @returns {Promise<void>}
 */
export const clearUserRefreshSet = async (userId) => {
  const redis = requireRedisClient();
  await redis.del(authRedisKeys.userRefreshSet(userId));
};

/**
 * Deletes multiple refresh keys using pipeline.
 * @param {string[]} refreshIds
 * @returns {Promise<void>}
 */
export const deleteManyRefreshRecords = async (refreshIds) => {
  if (!refreshIds.length) return;
  const redis = requireRedisClient();
  const multi = redis.multi();
  for (const refreshId of refreshIds) {
    multi.del(authRedisKeys.refresh(refreshId));
  }
  await multi.exec();
};

/**
 * Stores password reset token.
 * @param {string} token
 * @param {string} userId
 * @returns {Promise<void>}
 */
export const setPasswordResetToken = async (token, userId) => {
  const redis = requireRedisClient();
  await redis.setEx(authRedisKeys.passwordReset(token), PASSWORD_RESET_TTL_SECONDS, userId);
};

/**
 * Fetches password reset token owner.
 * @param {string} token
 * @returns {Promise<string | null>}
 */
export const getPasswordResetUserId = async (token) => {
  const redis = requireRedisClient();
  return redis.get(authRedisKeys.passwordReset(token));
};

/**
 * Deletes password reset token.
 * @param {string} token
 * @returns {Promise<void>}
 */
export const deletePasswordResetToken = async (token) => {
  const redis = requireRedisClient();
  await redis.del(authRedisKeys.passwordReset(token));
};

/**
 * Increments login attempts counter for ip.
 * @param {string} ip
 * @param {number} ttlSeconds
 * @returns {Promise<number>}
 */
export const incrementLoginRateLimit = async (ip, ttlSeconds) => {
  const redis = requireRedisClient();
  const key = authRedisKeys.rateLoginIp(ip);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, ttlSeconds);
  }
  return count;
};

/**
 * Increments OTP send attempts counter for email.
 * @param {string} email
 * @param {number} ttlSeconds
 * @returns {Promise<number>}
 */
export const incrementOtpSendRateLimit = async (email, ttlSeconds) => {
  const redis = requireRedisClient();
  const key = authRedisKeys.rateOtpSend(email);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, ttlSeconds);
  }
  return count;
};
