import BaseValidator from './base.js';
import { VALIDATION_PATTERNS, APP_CONSTANTS } from '../constants.js';

export class UserValidator extends BaseValidator {
  // ✅ FIX: cette validation retournait { firstName, lastName, bio,
  // profilePhoto } alors que UserService.updateProfile() (et les colonnes
  // en base) attendent { nom, pseudo, avatar_url }. Les deux ne
  // correspondaient jamais : même en appelant cette route, aucune mise à
  // jour n'était réellement persistée. On aligne la validation sur les
  // vrais champs utilisés partout ailleurs dans le backend.
  static validateProfileUpdate(data) {
    if (typeof data !== 'object' || data === null) {
      this.throwError('Invalid data provided');
    }

    const { nom, pseudo, avatar_url } = data;

    if (nom !== undefined && nom !== null) {
      this.validateLength(nom, 1, 50, 'Nom');
    }

    if (pseudo !== undefined && pseudo !== null) {
      this.validateLength(pseudo, APP_CONSTANTS.USERNAME_MIN_LENGTH, APP_CONSTANTS.USERNAME_MAX_LENGTH, 'Pseudo');
      if (!this.matchesPattern(pseudo, VALIDATION_PATTERNS.USERNAME)) {
        this.throwError('Le pseudo ne peut contenir que des lettres, chiffres, - et _');
      }
    }

    if (avatar_url !== undefined && avatar_url !== null && avatar_url !== '') {
      this.validateUrl(avatar_url);
    }

    return {
      nom: nom ? this.normalize(nom) : undefined,
      pseudo: pseudo ? pseudo.trim() : undefined,
      avatar_url: avatar_url !== undefined ? (avatar_url === null || avatar_url === '' ? null : avatar_url.trim()) : undefined,
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