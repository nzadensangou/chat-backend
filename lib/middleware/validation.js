// Validation middleware - Validate request data
import { API_MESSAGES } from '../utils/error-codes.js';

export const validationMiddleware = (validationFn) => {
  return (req, res, next) => {
    try {
      // Get data from body, query, or params (priority: body > query > params)
      const dataToValidate = req.body || req.query || req.params || {};

      // Call the validation function
      const validatedData = validationFn(dataToValidate);

      // Attach validated data to request
      req.validatedData = validatedData;

      next();
    } catch (err) {
      return res.status(400).json({
        status: 'error',
        statusCode: 400,
        message: API_MESSAGES.INVALID_INPUT,
        error: err.message,
      });
    }
  };
};

/**
 * Validation middleware factory for specific data sources
 * @param {Function} validationFn - Validation function
 * @param {string} source - Data source: 'body' (default), 'query', 'params'
 * @returns {Function} Express middleware
 */
export const validateData = (validationFn, source = 'body') => {
  return (req, res, next) => {
    try {
      const dataToValidate = req[source] || {};

      const validatedData = validationFn(dataToValidate);

      req.validatedData = validatedData;

      next();
    } catch (err) {
      return res.status(400).json({
        status: 'error',
        statusCode: 400,
        message: API_MESSAGES.INVALID_INPUT,
        error: err.message,
      });
    }
  };
};

export default validationMiddleware;
