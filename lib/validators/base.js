// Base validator with common utilities
import { VALIDATION_PATTERNS, APP_CONSTANTS } from '../constants.js';

export class BaseValidator {
  /**
   * Normalize phone number - remove all non-digit and non-plus characters
   * @param {string} phone - Phone number to normalize
   * @returns {string} Normalized phone number
   */
  static normalizePhone(phone) {
    return phone.replace(/[^\d+]/g, '');
  }

  /**
   * Trim and return empty string as null
   * @param {string} value - Value to normalize
   * @returns {string|null} Trimmed value or null
   */
  static normalize(value) {
    return value?.trim() ?? null;
  }

  /**
   * Check if value matches regex pattern
   * @param {string} value - Value to test
   * @param {RegExp} pattern - Regex pattern to match
   * @returns {boolean} True if matches
   */
  static matchesPattern(value, pattern) {
    if (typeof value !== 'string') return false;
    return pattern.test(value);
  }

  /**
   * Throw validation error
   * @param {string} message - Error message
   * @throws {Error} Validation error
   */
  static throwError(message) {
    throw new Error(message);
  }

  /**
   * Validate positive integer ID
   * @param {number} id - ID to validate
   * @param {string} fieldName - Field name for error message
   * @returns {number} Valid ID
   * @throws {Error} If ID is invalid
   */
  static validateId(id, fieldName = 'ID') {
    if (typeof id !== 'number' || id <= 0 || !Number.isInteger(id)) {
      this.throwError(`Invalid ${fieldName}: must be a positive integer`);
    }
    return id;
  }

  /**
   * Validate string length
   * @param {string} value - String to validate
   * @param {number} minLength - Minimum length
   * @param {number} maxLength - Maximum length
   * @param {string} fieldName - Field name for error
   * @returns {string} Trimmed valid string
   * @throws {Error} If length is invalid
   */
  static validateLength(value, minLength, maxLength, fieldName = 'Value') {
    if (typeof value !== 'string') {
      this.throwError(`${fieldName} must be a string`);
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      this.throwError(`${fieldName} is required`);
    }

    if (trimmed.length < minLength) {
      this.throwError(
        `${fieldName} must be at least ${minLength} characters`
      );
    }

    if (trimmed.length > maxLength) {
      this.throwError(
        `${fieldName} must not exceed ${maxLength} characters`
      );
    }

    return trimmed;
  }

  /**
   * Validate that value is one of allowed enum values
   * @param {*} value - Value to validate
   * @param {array} allowedValues - Array of allowed values
   * @param {string} fieldName - Field name for error
   * @returns {*} Valid enum value
   * @throws {Error} If value not in enum
   */
  static validateEnum(value, allowedValues, fieldName = 'Value') {
    if (!allowedValues.includes(value)) {
      this.throwError(
        `${fieldName} must be one of: ${allowedValues.join(', ')}`
      );
    }
    return value;
  }

  /**
   * Validate URL format
   * @param {string} url - URL to validate
   * @returns {string} Valid URL
   * @throws {Error} If URL is invalid
   */
  static validateUrl(url) {
    if (!url || typeof url !== 'string' || url.trim() === '') {
      this.throwError('URL is required');
    }

    if (!this.matchesPattern(url, VALIDATION_PATTERNS.URL)) {
      this.throwError('Invalid URL format');
    }

    if (url.length > 2048) {
      this.throwError('URL is too long');
    }

    return url.trim();
  }

  /**
   * Validate hex color code
   * @param {string} color - Color code to validate
   * @returns {string} Valid uppercase hex color
   * @throws {Error} If color is invalid
   */
  static validateColor(color) {
    if (!color || typeof color !== 'string') {
      return '#FFFFFF'; // Default color
    }

    if (!this.matchesPattern(color, VALIDATION_PATTERNS.HEX_COLOR)) {
      this.throwError('Invalid color format. Use hex code (e.g., #ffffff)');
    }

    return color.toUpperCase();
  }

  /**
   * Validate positive integer (duration, count, etc.)
   * @param {number} value - Integer to validate
   * @param {number} maxValue - Maximum allowed value
   * @param {string} fieldName - Field name for error
   * @returns {number} Valid integer
   * @throws {Error} If invalid
   */
  static validateInteger(value, maxValue = null, fieldName = 'Value') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      this.throwError(`${fieldName} must be a non-negative integer`);
    }

    if (maxValue && value > maxValue) {
      this.throwError(`${fieldName} cannot exceed ${maxValue}`);
    }

    return value;
  }

  /**
   * Validate boolean
   * @param {boolean} value - Boolean to validate
   * @returns {boolean} Valid boolean
   * @throws {Error} If not boolean
   */
  static validateBoolean(value) {
    if (typeof value !== 'boolean') {
      this.throwError('Value must be a boolean');
    }
    return value;
  }

  /**
   * Sanitize string - trim and remove extra whitespace
   * @param {string} value - String to sanitize
   * @returns {string} Sanitized string
   */
  static sanitize(value) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ');
  }

  /**
   * Check if string is empty or whitespace
   * @param {string} value - String to check
   * @returns {boolean} True if empty or whitespace
   */
  static isEmpty(value) {
    return !value || typeof value !== 'string' || value.trim() === '';
  }

  /**
   * Check if value is null or undefined
   * @param {*} value - Value to check
   * @returns {boolean} True if null or undefined
   */
  static isNullish(value) {
    return value === null || value === undefined;
  }

  /**
   * Validate array of IDs
   * @param {array} ids - Array of IDs to validate
   * @param {number} minCount - Minimum number of IDs
   * @param {string} fieldName - Field name for error
   * @returns {array} Valid array of IDs
   * @throws {Error} If invalid
   */
  static validateIdArray(ids, minCount = 1, fieldName = 'IDs') {
    if (!Array.isArray(ids)) {
      this.throwError(`${fieldName} must be an array`);
    }

    if (ids.length < minCount) {
      this.throwError(
        `${fieldName} must contain at least ${minCount} item(s)`
      );
    }

    ids.forEach((id, index) => {
      if (typeof id !== 'number' || id <= 0 || !Number.isInteger(id)) {
        this.throwError(`${fieldName}[${index}] must be a positive integer`);
      }
    });

    return ids;
  }

  /**
   * Validate object has required fields
   * @param {object} obj - Object to validate
   * @param {array} requiredFields - Array of required field names
   * @throws {Error} If any required field is missing
   */
  static validateRequiredFields(obj, requiredFields) {
    if (typeof obj !== 'object' || obj === null) {
      this.throwError('Invalid object provided');
    }

    for (const field of requiredFields) {
      if (this.isNullish(obj[field])) {
        this.throwError(`Required field "${field}" is missing`);
      }
    }
  }

  /**
   * Validate date is in future
   * @param {Date|string} date - Date to validate
   * @returns {Date} Valid future date
   * @throws {Error} If date is not in future
   */
  static validateFutureDate(date) {
    let dateObj = date instanceof Date ? date : new Date(date);

    if (isNaN(dateObj)) {
      this.throwError('Invalid date format');
    }

    if (dateObj <= new Date()) {
      this.throwError('Date must be in the future');
    }

    return dateObj;
  }

  /**
   * Validate date is in past
   * @param {Date|string} date - Date to validate
   * @returns {Date} Valid past date
   * @throws {Error} If date is not in past
   */
  static validatePastDate(date) {
    let dateObj = date instanceof Date ? date : new Date(date);

    if (isNaN(dateObj)) {
      this.throwError('Invalid date format');
    }

    if (dateObj >= new Date()) {
      this.throwError('Date must be in the past');
    }

    return dateObj;
  }

  /**
   * Get error code from error message
   * @param {string} message - Error message
   * @returns {string} Error code
   */
  static getErrorCode(message) {
    if (message.includes('required')) return 'FIELD_REQUIRED';
    if (message.includes('invalid')) return 'INVALID_FORMAT';
    if (message.includes('already exists')) return 'DUPLICATE';
    if (message.includes('not found')) return 'NOT_FOUND';
    if (message.includes('unauthorized')) return 'UNAUTHORIZED';
    return 'VALIDATION_ERROR';
  }
}

export default BaseValidator;
