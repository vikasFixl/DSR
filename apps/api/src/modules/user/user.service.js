import bcrypt from "bcryptjs";
import { User, UserSession } from "#db/models/index.js";
import { ApiError } from "#api/utils/ApiError.js";
import { logger } from "#api/utils/logger.js";
import {
  getUserRefreshIds,
  deleteManyRefreshRecords,
  clearUserRefreshSet,
  getRefreshRecord,
  deleteRefreshRecord,
  removeUserRefreshId
} from "#api/modules/auth/auth.redis.js";

const BCRYPT_ROUNDS = 12;

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
 * Get current user profile (no auth fields).
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getMe(userId) {
  const user = await User.findById(userId)
    .select("email name avatarUrl emailVerified status createdAt updatedAt")
    .lean();
  if (!user) {
    throw ApiError.notFound("User not found");
  }
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: user.emailVerified,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

/**
 * Update current user (name, avatarUrl).
 * @param {string} userId
 * @param {{ name?: string, avatarUrl?: string | null }} payload
 * @returns {Promise<object>}
 */
export async function updateMe(userId, payload) {
  const update = {};
  if (payload.name !== undefined) update.name = payload.name;
  if (payload.avatarUrl !== undefined) update.avatarUrl = payload.avatarUrl;

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: update },
    { new: true, runValidators: true }
  )
    .select("email name avatarUrl emailVerified status createdAt updatedAt")
    .lean();

  if (!user) {
    throw ApiError.notFound("User not found");
  }
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: user.emailVerified,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

/**
 * Change password; revoke all other sessions.
 * @param {string} userId
 * @param {{ currentPassword: string, newPassword: string }} input
 * @returns {Promise<{ message: string }>}
 */
export async function changePassword(userId, input) {
  const user = await User.findById(userId).lean();
  if (!user) {
    throw ApiError.notFound("User not found");
  }

  const passwordHash = user.auth?.passwordHash;
  if (!passwordHash) {
    throw ApiError.badRequest("Invalid credentials");
  }

  const valid = await verifyPassword(input.currentPassword, passwordHash);
  if (!valid) {
    throw ApiError.badRequest("Invalid credentials");
  }

  const newHash = await hashPassword(input.newPassword);
  const now = new Date();
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        "auth.passwordHash": newHash,
        passwordChangedAt: now
      }
    }
  );

  const refreshIds = await getUserRefreshIds(userId);
  await deleteManyRefreshRecords(refreshIds);
  await clearUserRefreshSet(userId);
  await UserSession.updateMany(
    { userId },
    { $set: { revokedAt: now } }
  ).catch(() => {});

  logger.info({ userId }, "Password changed, all sessions revoked");
  return { message: "Password changed successfully." };
}

/**
 * List active sessions for current user (excluding revoked).
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function getSessions(userId) {
  const sessions = await UserSession.find({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  })
    .select("tokenId deviceId userAgent ip expiresAt createdAt")
    .sort({ createdAt: -1 })
    .lean();

  return sessions.map((s) => ({
    tokenId: s.tokenId,
    deviceId: s.deviceId,
    userAgent: s.userAgent ?? null,
    ip: s.ip ?? null,
    expiresAt: s.expiresAt,
    createdAt: s.createdAt
  }));
}

/**
 * Revoke a specific session by tokenId (Redis refresh + DB session).
 * @param {string} userId
 * @param {string} tokenId
 * @returns {Promise<void>}
 */
export async function revokeSession(userId, tokenId) {
  const session = await UserSession.findOne({ userId, tokenId }).lean();
  if (!session) {
    throw ApiError.notFound("Session not found");
  }

  const refreshIds = await getUserRefreshIds(userId);
  for (const refreshId of refreshIds) {
    const record = await getRefreshRecord(refreshId);
    if (record?.sessionTokenId === tokenId) {
      await deleteRefreshRecord(refreshId);
      await removeUserRefreshId(userId, refreshId);
      break;
    }
  }

  await UserSession.updateOne(
    { userId, tokenId },
    { $set: { revokedAt: new Date() } }
  );
}
