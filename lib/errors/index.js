/**
 * Custom Application Error Classes
 * Replaces fragile string-based error handling with typed error classes
 */

// Base Error Class
export class AppError extends Error {
  constructor(message, statusCode, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = this.constructor.name;
  }
}

// 400 - Bad Request / Validation
export class ValidationError extends AppError {
  constructor(message, validationErrors = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.validationErrors = validationErrors;
  }
}

// 400 - Invalid Input
export class InvalidInputError extends AppError {
  constructor(message = 'Invalid input provided') {
    super(message, 400, 'INVALID_INPUT');
  }
}

// 401 - Unauthorized
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

// 401 - Invalid Token
export class InvalidTokenError extends AppError {
  constructor(message = 'Invalid token') {
    super(message, 401, 'INVALID_TOKEN');
  }
}

// 401 - Token Expired
export class TokenExpiredError extends AppError {
  constructor(message = 'Token expired') {
    super(message, 401, 'TOKEN_EXPIRED');
  }
}

// 403 - Forbidden / Access Denied
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

// 404 - Not Found
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.resource = resource;
  }
}

// 409 - Conflict
export class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

// 500 - Database Error
export class DatabaseError extends AppError {
  constructor(message, originalError = null) {
    super(`Database error: ${message}`, 500, 'DATABASE_ERROR');
    this.originalError = originalError;
  }
}

// Business Logic Errors
export class CallError extends AppError {
  constructor(message, code = 'CALL_ERROR') {
    super(message, 400, code);
  }
}

export class CallNotAllowedError extends CallError {
  constructor(message = 'Call is not allowed') {
    super(message, 'CALL_NOT_ALLOWED');
  }
}

export class SelfCallError extends CallError {
  constructor() {
    super('Cannot call yourself', 'SELF_CALL');
  }
}

export class UserBlockedError extends CallError {
  constructor() {
    super('User is blocked', 'USER_BLOCKED');
  }
}

export class UserError extends AppError {
  constructor(message, code = 'USER_ERROR') {
    super(message, 400, code);
  }
}

export class PhoneExistsError extends ConflictError {
  constructor() {
    super('Phone number already exists');
    this.code = 'PHONE_EXISTS';
  }
}

export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super('Invalid credentials');
    this.code = 'INVALID_CREDENTIALS';
  }
}

export class StatusError extends AppError {
  constructor(message, code = 'STATUS_ERROR') {
    super(message, 400, code);
  }
}

export class ParticipantError extends AppError {
  constructor(message, code = 'PARTICIPANT_ERROR') {
    super(message, 400, code);
  }
}
