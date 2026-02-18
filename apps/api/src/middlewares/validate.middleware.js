import { ZodError } from "zod";
import { ApiError } from "#api/utils/ApiError.js";

export const validate = (schema) => async (req, _res, next) => {
  try {
    req.validated = await schema.parseAsync({
      body: req.body,
      query: req.query,
      params: req.params
    });
    return next();
  } catch (error) {
    if (error instanceof ZodError) {
      return next(ApiError.badRequest("Validation failed", error.flatten()));
    }
    return next(error);
  }
};
