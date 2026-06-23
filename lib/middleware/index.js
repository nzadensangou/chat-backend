// Main middleware exports

// Core middlewares
export { default as authMiddleware } from './auth.js';
export { default as errorHandler } from './errorHandler.js';
export { default as corsHandler } from './corsHandler.js';
export { default as validationMiddleware, validateData } from './validation.js';
export {
  default as rateLimitMiddleware,
  authLimiter,
  apiLimiter,
  readLimiter,
  cleanupRateLimitStore,
} from './rateLimit.js';
export { default as loggerMiddleware } from './logger.js';

// Grouped export for convenience
export const middlewares = {
  // Auth
  auth: authMiddleware,

  // CORS
  cors: corsHandler,

  // Error handling
  errorHandler,

  // Validation
  validation: validationMiddleware,
  validateData,

  // Rate limiting
  rateLimit: rateLimitMiddleware,
  authLimiter,
  apiLimiter,
  readLimiter,

  // Logging
  logger: loggerMiddleware,
};

export default middlewares;
