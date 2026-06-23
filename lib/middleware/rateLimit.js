// Rate limiting middleware - Prevent abuse and brute force attacks

const requestStore = new Map();

/**
 * Rate limit middleware factory
 * @param {Object} options - Configuration options
 * @param {number} options.max - Maximum requests per window (default: 100)
 * @param {number} options.windowMs - Time window in ms (default: 15 minutes)
 * @param {string} options.keyGenerator - Function to generate rate limit key (default: IP address)
 * @param {boolean} options.skipSuccessfulRequests - Skip on successful status (default: false)
 * @param {boolean} options.skipFailedRequests - Skip on failed status (default: false)
 * @returns {Function} Express middleware
 */
export const rateLimitMiddleware = (options = {}) => {
  const {
    max = 100,
    windowMs = 15 * 60 * 1000, // 15 minutes
    keyGenerator = (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return (req, res, next) => {
    // Generate rate limit key
    const key = keyGenerator(req);

    // Get current request data
    const now = Date.now();
    const requestData = requestStore.get(key) || {
      count: 0,
      resetTime: now + windowMs,
    };

    // Check if window has expired
    if (now > requestData.resetTime) {
      requestData.count = 0;
      requestData.resetTime = now + windowMs;
    }

    // Increment request count
    requestData.count++;
    requestStore.set(key, requestData);

    // Set rate limit headers
    const remaining = Math.max(max - requestData.count, 0);
    const resetTime = Math.ceil((requestData.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', requestData.resetTime);

    // Check if limit exceeded
    if (requestData.count > max) {
      res.setHeader('Retry-After', resetTime);
      return res.status(429).json({
        status: 'error',
        statusCode: 429,
        message: 'Too many requests, please try again later',
        retryAfter: resetTime,
      });
    }

    // Add skip logic to response
    const originalJson = res.json;
    res.json = function (data) {
      const statusCode = res.statusCode;
      const shouldSkip =
        (skipSuccessfulRequests && statusCode >= 200 && statusCode < 300) ||
        (skipFailedRequests && statusCode >= 400);

      // Only decrement if we should skip this request
      if (shouldSkip && requestData.count > 0) {
        requestData.count--;
        requestStore.set(key, requestData);
      }

      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * Specific rate limiters
 */

// Strict limiter for auth endpoints (login, register, password reset)
export const authLimiter = rateLimitMiddleware({
  max: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

// Standard limiter for general API endpoints
export const apiLimiter = rateLimitMiddleware({
  max: 100,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

// Relaxed limiter for read-only endpoints
export const readLimiter = rateLimitMiddleware({
  max: 500,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

/**
 * Cleanup function - Remove expired entries periodically
 */
export const cleanupRateLimitStore = () => {
  const now = Date.now();
  for (const [key, data] of requestStore.entries()) {
    if (now > data.resetTime) {
      requestStore.delete(key);
    }
  }
};

// Run cleanup every 10 minutes
setInterval(cleanupRateLimitStore, 10 * 60 * 1000);

export default rateLimitMiddleware;
