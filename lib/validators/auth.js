// Authentication validator
import { BaseValidator } from './base.js';
import { VALIDATION_PATTERNS, APP_CONSTANTS } from '../constants.js';

export class AuthValidator extends BaseValidator {
  /**
   * Validates phone number for registration/login
   * For registration: 6 digits freely chosen by user
   * For login: accepts legacy formats (+237 + 9 digits) and normalizes to 6 digits
   * Legacy normalization: +237XXXXXXXXX → extracts last 6 digits of the 9-digit number
   * @param {string} phone - Phone number to validate
   * @param {boolean} isRegistration - If true, validates as registration (6 digits)
   * @returns {string} Normalized phone number (always 6 digits)
   * @throws {Error} If phone is invalid
   */
  static validatePhoneNumber(phone, isRegistration = false) {
    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
      this.throwError('Phone number is required');
    }

    const cleanPhone = phone.trim().replace(/\D/g, '');

    // For registration: exactly 6 digits
    if (isRegistration) {
      if (cleanPhone.length !== 6) {
        this.throwError('Phone number must be exactly 6 digits');
      }
      return cleanPhone;
    }

    // For login: accept 6 digits or legacy Cameroon format (+237 + 9 digits)
    if (cleanPhone.length === 6) {
      // Already 6 digits
      return cleanPhone;
    }

    if (cleanPhone.length === 9) {
      // Could be legacy format without +237 prefix
      // Return last 6 digits to match DB storage
      return cleanPhone.slice(-6);
    }

    if (cleanPhone.length === 12) {
      // Legacy format: +237 + 9 digits → extract 9 digits, return last 6
      return cleanPhone.slice(-9).slice(-6);
    }

    this.throwError('Phone must be 6 digits or Cameroon format (+237 + 9 digits)');
  }

  /**
   * Validates username format and length
   * @param {string} username - Username to validate
   * @returns {string} Lowercase trimmed username
   * @throws {Error} If username is invalid
   */
  static validateUsername(username) {
    if (!username || typeof username !== 'string' || username.trim() === '') {
      this.throwError('Username is required');
    }

    const trimmed = username.trim();

    if (trimmed.length < APP_CONSTANTS.USERNAME_MIN_LENGTH) {
      this.throwError(
        `Username must be at least ${APP_CONSTANTS.USERNAME_MIN_LENGTH} characters`
      );
    }

    if (trimmed.length > APP_CONSTANTS.USERNAME_MAX_LENGTH) {
      this.throwError(
        `Username must not exceed ${APP_CONSTANTS.USERNAME_MAX_LENGTH} characters`
      );
    }

    if (!this.matchesPattern(trimmed, VALIDATION_PATTERNS.USERNAME)) {
      this.throwError(
        'Username must contain only letters, numbers, underscores, and hyphens'
      );
    }

    return trimmed.toLowerCase();
  }

  /**
   * Validates password strength
   * @param {string} password - Password to validate
   * @returns {string} Validated password
   * @throws {Error} If password is weak
   */
  static validatePassword(password) {
    if (!password || typeof password !== 'string' || password === '') {
      this.throwError('Password is required');
    }

    if (password.length < APP_CONSTANTS.PASSWORD_MIN_LENGTH) {
      this.throwError(
        `Password must be at least ${APP_CONSTANTS.PASSWORD_MIN_LENGTH} characters`
      );
    }

    if (password.length > APP_CONSTANTS.PASSWORD_MAX_LENGTH) {
      this.throwError(
        `Password must not exceed ${APP_CONSTANTS.PASSWORD_MAX_LENGTH} characters`
      );
    }

    if (!this.matchesPattern(password, VALIDATION_PATTERNS.PASSWORD)) {
      this.throwError(
        'Password must contain uppercase, lowercase, number, and special character'
      );
    }

    return password;
  }

  /**
   * Validates optional email address
   * @param {string} email - Email to validate
   * @returns {string|null} Lowercase email or null if not provided
   * @throws {Error} If email format is invalid
   */
  static validateEmail(email) {
    if (!email || typeof email !== 'string' || email.trim() === '') {
      return null;
    }

    const trimmed = email.trim().toLowerCase();

    if (trimmed.length > APP_CONSTANTS.EMAIL_MAX_LENGTH) {
      this.throwError(
        `Email must not exceed ${APP_CONSTANTS.EMAIL_MAX_LENGTH} characters`
      );
    }

    if (!this.matchesPattern(trimmed, VALIDATION_PATTERNS.EMAIL)) {
      this.throwError('Invalid email address');
    }

    return trimmed;
  }

  /**
   * Validates registration payload
   * @param {object} payload - Registration data
   * @returns {object} Validated registration data
   * @throws {Error} If any field is invalid
   */
  static validateRegistration(payload) {
    const { alanyaPhone, username, password, idPays, email, nom, pseudo } = payload;

    // Phone number is required (6 digits) for registration
    if (!alanyaPhone || typeof alanyaPhone !== 'string' || alanyaPhone.trim() === '') {
      this.throwError('Phone number is required');
    }

    const normalizedPhone = this.validatePhoneNumber(alanyaPhone, true);

    // idPays is now optional (can be null)
    let validatedIdPays = null;
    if (idPays) {
      if (typeof idPays !== 'number' || idPays <= 0) {
        this.throwError('Country ID must be a valid positive number');
      }
      validatedIdPays = idPays;
    }

    return {
      alanyaPhone: normalizedPhone,
      username: this.validateUsername(username),
      password: this.validatePassword(password),
      email: this.validateEmail(email),
      idPays: validatedIdPays,
      nom: this.validateOptionalString(nom, APP_CONSTANTS.NAME_MAX_LENGTH),
      pseudo: this.validateOptionalString(pseudo, APP_CONSTANTS.PSEUDO_MAX_LENGTH),
    };
  }

  /**
   * Validates login payload
   * Accepts 6-digit phone numbers or legacy Cameroon format (+237 + 9 digits)
   * @param {object} payload - Login data
   * @returns {object} Validated login data
   * @throws {Error} If any field is invalid
   */
  static validateLogin(payload) {
    const { alanyaPhone, password } = payload;

    return {
      alanyaPhone: this.validatePhoneNumber(alanyaPhone, false),
      password: this.validatePassword(password),
    };
  }

  /**
   * Validates password recovery payload
   * @param {object} payload - Recovery data
   * @returns {object} Validated recovery data
   * @throws {Error} If email is invalid
   */
  static validatePasswordRecovery(payload) {
    const { email } = payload;

    const validatedEmail = this.validateEmail(email);
    if (!validatedEmail) {
      this.throwError('Valid email is required for password recovery');
    }

    return {
      email: validatedEmail,
    };
  }

  /**
   * Helper: Validates optional string field
   * @param {string} value - Value to validate
   * @param {number} maxLength - Maximum length allowed
   * @returns {string|null} Trimmed value or null
   * @private
   */
  static validateOptionalString(value, maxLength) {
    if (!value || typeof value !== 'string' || value.trim() === '') {
      return null;
    }

    const trimmed = value.trim();

    if (trimmed.length > maxLength) {
      this.throwError(
        `Value must not exceed ${maxLength} characters`
      );
    }

    return trimmed;
  }
}

export default AuthValidator;
