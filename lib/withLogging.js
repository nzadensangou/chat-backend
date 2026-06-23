import { logger, logRequest, logError } from './logger.js';
import { ApiResponse } from './utils/response.js';
import { ERROR_CODES } from './utils/error-codes.js';
import { corsHandler } from './middleware/corsHandler.js';

export const withLogging = (handler, options = {}) => {
  const { logBody = false, logHeaders = false } = options;

  return async (req, res) => {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7).toUpperCase();

    res.requestId = requestId;

    try {
      if (process.env.NODE_ENV === 'development' && logHeaders) {
        logger.debug(
          {
            requestId,
            method: req.method,
            path: req.url,
            headers: req.headers,
            query: req.query,
            ...(logBody && { body: req.body }),
          },
          `[${requestId}] Incoming request`
        );
      }

      const result = await handler(req, res);

      const duration = Date.now() - startTime;
      const statusCode = res.statusCode || 200;

      logRequest(req, res, req.method, req.url, statusCode, duration);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      logError(error, {
        requestId,
        method: req.method,
        path: req.url,
        duration_ms: duration,
      });

      if (!res.headersSent) {
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json(
          ApiResponse.error(
            ERROR_CODES.INTERNAL_ERROR.message,
            500,
            isDev ? error.message : null
          )
        );
      }
    }
  };
};

export const withMethodHandlers = (handlers, options = {}) => {
  return withLogging(async (req, res) => {
    const method = req.method.toUpperCase();
    const handler = handlers[method];

    if (!handler) {
      return res.status(405).json(
        ApiResponse.error(ERROR_CODES.METHOD_NOT_ALLOWED.message, 405)
      );
    }

    return handler(req, res);
  }, options);
};

export default withLogging;

export { corsHandler };

