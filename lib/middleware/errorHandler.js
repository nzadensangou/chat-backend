// Error handler middleware - Centralized error handling
import { API_MESSAGES } from '../utils/error-codes.js';
import { logger } from '../logger.js';

export const errorHandler = (err, req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';

  let statusCode = 500;
  let message = API_MESSAGES.INTERNAL_ERROR;
  let errorDetails = null;

  if (err.message === API_MESSAGES.UNAUTHORIZED) {
    statusCode = 401;
    message = API_MESSAGES.UNAUTHORIZED;
  } else if (err.message === API_MESSAGES.INVALID_TOKEN || err.message === API_MESSAGES.TOKEN_EXPIRED) {
    statusCode = 401;
    message = err.message;
  } else if (err.message === API_MESSAGES.FORBIDDEN) {
    statusCode = 403;
    message = API_MESSAGES.FORBIDDEN;
  } else if (err.message === API_MESSAGES.NOT_FOUND || err.message?.includes('not found')) {
    statusCode = 404;
    message = err.message || API_MESSAGES.NOT_FOUND;
  } else if (err.message === API_MESSAGES.CONFLICT || err.message?.includes('already exists')) {
    statusCode = 409;
    message = err.message;
  } else if (err.message === API_MESSAGES.INVALID_INPUT || err.validationErrors) {
    statusCode = 400;
    message = err.message || API_MESSAGES.INVALID_INPUT;
    if (err.validationErrors && !isProduction) {
      errorDetails = err.validationErrors;
    }
  } else if (err.message) {
    message = isProduction ? API_MESSAGES.INTERNAL_ERROR : err.message;
  }

  // Log error in development
  if (!isProduction) {
    logger.error({
      status: statusCode,
      message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    }, 'Error occurred');
  }

  return res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    ...(errorDetails && { errors: errorDetails }),
    ...((!isProduction && err.stack) && { stack: err.stack }),
  });
};

export default errorHandler;
