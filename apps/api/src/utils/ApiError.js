export class ApiError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.isOperational = options.isOperational ?? true;
    this.details = options.details;
  }

  static badRequest(message = "Bad request", details) {
    return new ApiError(400, message, { details });
  }

  static notFound(message = "Resource not found") {
    return new ApiError(404, message);
  }

  static serviceUnavailable(message = "Service unavailable", details) {
    return new ApiError(503, message, { details });
  }
}
