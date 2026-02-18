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
      const accessToken = getAccessTokenFromCookies(req);
      if (!accessToken) {
        throw new ApiError(401, "Unauthorized");
      }

      const payload = verifyAccessToken(accessToken);
      req.user = { id: String(payload.sub) };
      return next();
    } catch (error) {
      logger.warn({ err: error }, "Authentication failed");
      return next(new ApiError(401, "Unauthorized"));
    }
  };
};

