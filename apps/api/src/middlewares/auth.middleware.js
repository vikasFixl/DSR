import { ApiError } from "#api/utils/ApiError.js";
import { logger } from "#api/utils/logger.js";
import { getAccessTokenFromCookies } from "#api/modules/auth/auth.cookies.js";
import { verifyAccessToken } from "#api/modules/auth/auth.tokens.js";

/**
 * Auth middleware that validates access token from cookie and attaches req.user.
 * @returns {import("express").RequestHandler}
 */
export const authenticate = () => {
  return async (req, _res, next) => {
    try {
      let accessToken = null;

      // 1️⃣ First check cookies
      if (req.cookies && req.cookies.accessToken) {
        accessToken = req.cookies.accessToken;
      }

      // 2️⃣ If not in cookies, check Authorization header
      if (!accessToken && req.headers.authorization) {
        const authHeader = req.headers.authorization;

        if (authHeader.startsWith("Bearer ")) {
          accessToken = authHeader.split(" ")[1];
        }
      }

      if (!accessToken) {
        throw new ApiError(401, "Unauthorized");
      }

      const payload = verifyAccessToken(accessToken);

      req.user = {
        id: String(payload.sub),
      };

      return next();
    } catch (error) {
      logger.warn({ err: error }, "Authentication failed");
      return next(new ApiError(401, "Unauthorized"));
    }
  };
};