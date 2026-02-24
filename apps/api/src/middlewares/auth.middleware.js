import { ApiError } from "#api/utils/ApiError.js";
import { logger } from "#api/utils/logger.js";
import { getAccessTokenFromCookies } from "#api/modules/auth/auth.cookies.js";
import { verifyAccessToken } from "#api/modules/auth/auth.tokens.js";


export const authenticate = () => {
  return async (req, _res, next) => {
    try {
      let accessToken = null;

      // 1️⃣ Extract token
      if (req.cookies?.accessToken) {
        accessToken = req.cookies.accessToken;
      }

      if (!accessToken && req.headers.authorization?.startsWith("Bearer ")) {
        accessToken = req.headers.authorization.split(" ")[1];
      }

      if (!accessToken) {
        throw new ApiError(401, "Unauthorized");
      }

      // 2️⃣ Verify JWT
      const payload = verifyAccessToken(accessToken);

      const { sub, sessionId } = payload;

      if (!sub || !sessionId) {
        throw new ApiError(401, "Unauthorized");
      }

      // 3️⃣ Check Redis session
      const sessionKey = authRedisKeys.session(sessionId);
      const sessionRaw = await redis.get(sessionKey);

      if (!sessionRaw) {
        // Redis session missing → possible expiry or manual revoke
        // Optional fallback check Mongo to confirm
        const dbSession = await UserSession.findById(sessionId)
          .select("revoked expiresAt")
          .lean();

        if (!dbSession || dbSession.revoked) {
          throw new ApiError(401, "Unauthorized");
        }

        // Session exists in DB but Redis expired → restore Redis session
        const ttl = Math.floor(
          (new Date(dbSession.expiresAt).getTime() - Date.now()) / 1000
        );

        if (ttl <= 0) {
          throw new ApiError(401, "Unauthorized");
        }

        const fingerprint = hash(
          (req.headers["user-agent"] ?? "") + (req.ip ?? "")
        );

        await redis.set(
          sessionKey,
          JSON.stringify({ userId: sub, fingerprint }),
          "EX",
          ttl
        );
      } else {
        const session = JSON.parse(sessionRaw);

        // 4️⃣ Fingerprint validation
        const currentFingerprint = hash(
          (req.headers["user-agent"] ?? "") + (req.ip ?? "")
        );

        if (session.fingerprint !== currentFingerprint) {
          throw new ApiError(401, "Unauthorized");
        }
      }

      // 5️⃣ Attach user context
      req.user = {
        id: sub,
        sessionId
      };

      return next();
    } catch (error) {
      logger.warn({ err: error }, "Authentication failed");
      return next(new ApiError(401, "Unauthorized"));
    }
  };
};