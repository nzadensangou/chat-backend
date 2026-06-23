import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

// Pino logger instance with custom configuration
export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          singleLine: false,
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Log HTTP request in Next.js API routes
 * @param {Object} req - Next.js request object
 * @param {Object} res - Next.js response object
 * @param {string} method - HTTP method
 * @param {string} path - Request path
 * @param {number} statusCode - Response status code
 * @param {number} duration - Request duration in ms
 */
export const logRequest = (req, res, method = req.method, path = req.url, statusCode = res.statusCode, duration = 0) => {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  const logData = {
    method,
    path,
    statusCode,
    duration_ms: duration,
    ip,
    userAgent: userAgent.substring(0, 100),
  };

  if (statusCode >= 500) {
    logger.error(logData, `${method} ${path} - ERROR ${statusCode}`);
  } else if (statusCode >= 400) {
    logger.warn(logData, `${method} ${path} - WARNING ${statusCode}`);
  } else if (statusCode >= 300) {
    logger.debug(logData, `${method} ${path} - ${statusCode}`);
  } else {
    logger.info(logData, `${method} ${path} - ${statusCode}`);
  }
};

/**
 * Log errors with context
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 */
export const logError = (error, context = {}) => {
  logger.error(
    {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      ...context,
    },
    `Error: ${error.message}`
  );
};

/**
 * Log info messages
 * @param {string} message - Log message
 * @param {Object} data - Additional data
 */
export const logInfo = (message, data = {}) => {
  logger.info(data, message);
};

/**
 * Log warning messages
 * @param {string} message - Log message
 * @param {Object} data - Additional data
 */
export const logWarn = (message, data = {}) => {
  logger.warn(data, message);
};

/**
 * Log debug messages
 * @param {string} message - Log message
 * @param {Object} data - Additional data
 */
export const logDebug = (message, data = {}) => {
  logger.debug(data, message);
};

export default logger;
