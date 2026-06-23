import BaseValidator from './base.js';
import { VALIDATION_PATTERNS, APP_CONSTANTS } from '../constants.js';

export class UserValidator extends BaseValidator {
  static validateProfileUpdate(data) {
    if (typeof data !== 'object' || data === null) {
      this.throwError('Invalid data provided');
    }

    const { firstName, lastName, bio, profilePhoto } = data;

    if (firstName !== undefined && firstName !== null) {
      this.validateLength(firstName, 1, 50, 'First name');
    }

    if (lastName !== undefined && lastName !== null) {
      this.validateLength(lastName, 1, 50, 'Last name');
    }

    if (bio !== undefined && bio !== null) {
      if (typeof bio !== 'string') {
        this.throwError('Bio must be a string');
      }
      if (bio.trim().length > 500) {
        this.throwError('Bio must not exceed 500 characters');
      }
    }

    if (profilePhoto !== undefined && profilePhoto !== null) {
      this.validateUrl(profilePhoto);
    }

    return {
      firstName: firstName ? this.normalize(firstName) : undefined,
      lastName: lastName ? this.normalize(lastName) : undefined,
      bio: bio ? this.sanitize(bio) : undefined,
      profilePhoto: profilePhoto ? profilePhoto.trim() : undefined,
    };
  }

  static validatePasswordChange(data) {
    if (typeof data !== 'object' || data === null) {
      this.throwError('Invalid data provided');
    }

    const { currentPassword, newPassword, confirmPassword } = data;

    if (this.isEmpty(currentPassword)) {
      this.throwError('Current password is required');
    }

    if (this.isEmpty(newPassword)) {
      this.throwError('New password is required');
    }

    this.validateLength(newPassword, APP_CONSTANTS.PASSWORD_MIN_LENGTH, 128, 'New password');

    if (newPassword !== confirmPassword) {
      this.throwError('Passwords do not match');
    }

    if (currentPassword === newPassword) {
      this.throwError('New password must be different from current password');
    }

    return {
      currentPassword: currentPassword.trim(),
      newPassword: newPassword.trim(),
    };
  }

  static validatePhoneUpdate(data) {
    if (typeof data !== 'object' || data === null) {
      this.throwError('Invalid data provided');
    }

    const { phone } = data;

    if (this.isEmpty(phone)) {
      this.throwError('Phone number is required');
    }

    const normalized = this.normalizePhone(phone);

    if (!this.matchesPattern(normalized, VALIDATION_PATTERNS.PHONE)) {
      this.throwError('Invalid phone number format');
    }

    return { phone: normalized };
  }

  static validateUsernameUpdate(data) {
    if (typeof data !== 'object' || data === null) {
      this.throwError('Invalid data provided');
    }

    const { username } = data;

    this.validateLength(username, APP_CONSTANTS.USERNAME_MIN_LENGTH, 30, 'Username');

    if (!this.matchesPattern(username, VALIDATION_PATTERNS.USERNAME)) {
      this.throwError('Username can only contain letters, numbers, and underscores');
    }

    return { username: username.trim() };
  }

  static validateUserDeletion(data) {
    if (typeof data !== 'object' || data === null) {
      this.throwError('Invalid data provided');
    }

    const { password, confirm } = data;

    if (this.isEmpty(password)) {
      this.throwError('Password is required to delete account');
    }

    if (!confirm) {
      this.throwError('Please confirm account deletion');
    }

    return { password: password.trim() };
  }
}

export default UserValidator;
