import * as userService from "#api/modules/user/user.service.js";

/**
 * GET /users/me - current user profile.
 */
export async function getMe(req, res, next) {
  try {
    const userId = req.user.id;
    const user = await userService.getMe(userId);
    return res.status(200).json(user);
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /users/me - update profile.
 */
export async function updateMe(req, res, next) {
  try {
    const userId = req.user.id;
    const { body } = req.validated;
    const user = await userService.updateMe(userId, body);
    return res.status(200).json(user);
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /users/change-password - change password and revoke other sessions.
 */
export async function changePassword(req, res, next) {
  try {
    const userId = req.user.id;
    const { body } = req.validated;
    const result = await userService.changePassword(userId, body);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /users/sessions - list active sessions.
 */
export async function getSessions(req, res, next) {
  try {
    const userId = req.user.id;
    const sessions = await userService.getSessions(userId);
    return res.status(200).json({ sessions });
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /users/sessions/:tokenId - revoke one session.
 */
export async function revokeSession(req, res, next) {
  try {
    const userId = req.user.id;
    const { tokenId } = req.validated.params;
    await userService.revokeSession(userId, tokenId);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}
