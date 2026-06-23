// Codes HTTP et messages d'erreur standardisés
export const ERROR_CODES = {
  // 4xx Client errors
  BAD_REQUEST: { code: 400, message: 'Invalid request' },
  UNAUTHORIZED: { code: 401, message: 'Unauthorized' },
  FORBIDDEN: { code: 403, message: 'Forbidden' },
  NOT_FOUND: { code: 404, message: 'Resource not found' },
  CONFLICT: { code: 409, message: 'Resource already exists' },
  VALIDATION_ERROR: { code: 400, message: 'Validation failed' },
  METHOD_NOT_ALLOWED: { code: 405, message: 'Method not allowed' },

  // 5xx Server errors
  INTERNAL_ERROR: { code: 500, message: 'Internal server error' },
};

export const API_RESPONSE_MESSAGES = {
  // Generic messages
  SUCCESS: 'Success',
  CREATED: 'Resource created successfully',
  UPDATED: 'Resource updated successfully',
  DELETED: 'Resource deleted successfully',
  INVALID_INPUT: 'Invalid input provided',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Forbidden',
  NOT_FOUND: 'Resource not found',
  CONFLICT: 'Resource already exists',
  INTERNAL_ERROR: 'Internal server error',

  // User-related messages
  USER_NOT_FOUND: 'User not found',
  INVALID_CREDENTIALS: 'Invalid username or password',
  USERNAME_EXISTS: 'Username already exists',
  PHONE_EXISTS: 'Phone number already exists',

  // Authentication messages
  TOKEN_EXPIRED: 'Token has expired',
  INVALID_TOKEN: 'Invalid token',

  // Call-related messages
  USER_BLOCKED: 'User is blocked from calling',
  NOT_IN_CONTACTS: 'User not in your contacts',
  CALL_NOT_ALLOWED: 'Call not allowed - add user to contacts first',
};

// Backward compatibility alias
export const API_MESSAGES = API_RESPONSE_MESSAGES;

export default { ERROR_CODES, API_RESPONSE_MESSAGES, API_MESSAGES };
