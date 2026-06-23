import pino from 'pino';
import pinoHttp from 'pino-http';

const isDevelopment = process.env.NODE_ENV !== 'production';

// Pino logger instance with custom configuration
const pinoLogger = pino({
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

// HTTP request logging middleware using pino-http
export const loggerMiddleware = (options = {}) => {
  const {
    showBody = false,
    showHeaders = false,
    level = 'info',
  } = options;

  return pinoHttp(
    {
      level: level,
      logger: pinoLogger,
      customLogLevel: (req, res, err) => {
        if (res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        if (res.statusCode >= 300) return 'info';
        return 'info';
      },
      customSuccessMessage: (req, res) => {
        return `${req.method} ${req.path} - ${res.statusCode}`;
      },
      customErrorMessage: (req, res, err) => {
        return `${req.method} ${req.path} - ${res.statusCode} - ${err?.message || 'Unknown error'}`;
      },
      customAttributeKeys: {
        req: 'request',
        res: 'response',
        err: 'error',
        responseTime: 'duration_ms',
      },
      // Additional data to include in logs
      ...(showBody && {
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: req.body,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
            headers: res.headers,
          }),
        },
      }),
    }
  );
};

// Simple logger - minimal logging (development)
export const simpleLogger = loggerMiddleware({ showBody: false, showHeaders: false, level: 'info' });

// Debug logger - full logging with body and headers
export const debugLogger = loggerMiddleware({ showBody: true, showHeaders: true, level: 'debug' });

// Production logger - minimal but essential info
export const productionLogger = pinoHttp({
  level: 'info',
  logger: pinoLogger,
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Only log errors and slow requests in production
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

// Export logger instance for direct use in services
export { pinoLogger };

// Export default for backward compatibility
export default loggerMiddleware;
