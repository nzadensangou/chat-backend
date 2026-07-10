import db from '../db/index.js';
import { validate, safeValidate, handleValidationError } from '../validators/index.js';
import { generateToken } from '../jwt.js';
import { API_MESSAGES } from '../utils/error-codes.js';
import bcryptjs from 'bcryptjs';
import { logger } from '../logger.js';

export class UserService {
  /**
   * Register a new user
   * @param {object} payload - Registration data
   * @returns {object} User data with JWT token
   * @throws {Error} If registration fails
   */
  static async register(payload) {
    // payload is already validated by the caller (register.js)
    const { alanyaPhone, password, idPays, nom, pseudo } = payload;

    // Phone number is provided by user (6 digits)
    const finalPhoneNumber = alanyaPhone;

    // Check if phone already exists
    const existingPhone = await this.getUserByPhone(finalPhoneNumber);
    if (existingPhone) {
      throw new Error(API_MESSAGES.PHONE_EXISTS);
    }

    // Generate next user ID (since alanyaID doesn't have AUTO_INCREMENT)
    const maxIdResult = await db.getOne('SELECT MAX(alanyaID) as maxId FROM users');
    const nextUserId = (maxIdResult?.maxId || 0) + 1;

    // Hash password (no salt needed with bcryptjs - it's included in hash)
    const passwordHash = await bcryptjs.hash(password, 10);

    // Create user in database
    const query = `
      INSERT INTO users (alanyaID, alanyaPhone, nom, pseudo, idPays, password, type_compte, is_online, last_seen, exclus, in_call, biometric, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0, NOW(), 0, 0, 0, NOW())
    `;

    await db.query(query, [nextUserId, finalPhoneNumber, nom, pseudo, idPays, passwordHash]);

    // Create JWT token
    const token = generateToken({
      alanyaID: nextUserId,
      typeCompte: 'personal',
    });

    return {
      alanyaID: nextUserId,
      alanyaPhone: finalPhoneNumber,
      nom,
      pseudo,
      token,
      message: 'User registered successfully',
    };
  }

  /**
   * Login user with phone and password
   * @param {object} payload - Login data
   * @returns {object} User data with JWT token
   * @throws {Error} If login fails
   */
  static async login(payload) {
    const { alanyaPhone, password } = payload;
    logger.debug({ phone: alanyaPhone }, 'Login attempt');

    // Find user by phone
    const user = await this.getUserByPhone(alanyaPhone);
    logger.debug({ userId: user.alanyaID, nom: user.nom }, 'User found');

    // Verify password (column is 'password' not 'passwordHash')
    const isPasswordValid = await bcryptjs.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error(API_MESSAGES.INVALID_CREDENTIALS);
    }

    // Update last seen
    await this.updateLastSeen(user.alanyaID);

    // Generate JWT token
    const token = generateToken({
      alanyaID: user.alanyaID,
      typeCompte: user.type_compte,
    });

    return {
      alanyaID: user.alanyaID,
      alanyaPhone: user.alanyaPhone,
      nom: user.nom,
      pseudo: user.pseudo,
      avatar_url: user.avatar_url,
      type_compte: user.type_compte,
      is_online: user.is_online,
      token,
      message: 'Login successful',
    };
  }

  /**
   * Get user profile by ID
   * @param {number} userId - User ID
   * @returns {object} User profile data
   * @throws {Error} If user not found
   */
  static async getProfile(userId) {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error(API_MESSAGES.USER_NOT_FOUND);
    }

    // Don't expose password hash
    const { password, ...profileData } = user;
    return profileData;
  }

  /**
   * Update user profile
   * @param {number} userId - User ID
   * @param {object} payload - Update data
   * @returns {object} Updated user data
   * @throws {Error} If update fails
   */
  static async updateProfile(userId, payload) {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error(API_MESSAGES.USER_NOT_FOUND);
    }

    const { nom, pseudo, avatar_url, type_compte } = payload;

    // Validate optional fields
    const updates = {};
    if (nom !== undefined) {
      updates.nom = nom === null ? null : nom.trim();
    }
    if (pseudo !== undefined) {
      updates.pseudo = pseudo === null ? null : pseudo.trim();
    }
    if (avatar_url !== undefined) {
      updates.avatar_url = avatar_url === null ? null : avatar_url.trim();
    }
    if (type_compte !== undefined) {
      updates.type_compte = type_compte;
    }

    if (Object.keys(updates).length === 0) {
      return { ...user, ...updates };
    }

    // Build update query dynamically
    const fields = Object.keys(updates).map((key) => `${key} = ?`).join(', ');
    const values = Object.values(updates);

    const query = `UPDATE users SET ${fields} WHERE alanyaID = ?`;
    await db.query(query, [...values, userId]);

    return { alanyaID: userId, ...updates };
  }

  /**
   * Change user password
   * @param {number} userId - User ID
   * @param {string} oldPassword - Current password
   * @param {string} newPassword - New password
   * @returns {object} Success message
   * @throws {Error} If password change fails
   */
  static async changePassword(userId, oldPassword, newPassword) {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error(API_MESSAGES.USER_NOT_FOUND);
    }

    // Verify old password (column is 'password' not 'passwordHash')
    const isPasswordValid = await bcryptjs.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const passwordHash = await bcryptjs.hash(newPassword, 10);

    const query = `UPDATE users SET password = ? WHERE alanyaID = ?`;
    await db.query(query, [passwordHash, userId]);

    return { message: 'Password changed successfully' };
  }

  /**
   * Delete user account
   * @param {number} userId - User ID
   * @returns {object} Success message
   * @throws {Error} If deletion fails
   */
  static async deleteAccount(userId) {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error(API_MESSAGES.USER_NOT_FOUND);
    }

    // Soft delete - mark user as deleted by adding [DELETED] prefix and updating avatar
    const deletedPseudo = `[DELETED]_${userId}`;
    const query = `UPDATE users SET pseudo = ?, avatar_url = 'NON DEFINI', exclus = 1 WHERE alanyaID = ?`;
    await db.query(query, [deletedPseudo, userId]);

    return { message: 'Account deleted successfully' };
  }

  /**
   * Get user by phone number
   * @param {string} phoneNumber - Phone number to search
   * @returns {object|null} User data or null
   */
  static async getUserByPhone(phoneNumber) {
    const query = `SELECT * FROM users WHERE alanyaPhone = ? LIMIT 1`;
    return await db.getOne(query, [phoneNumber]);
  }

  /**
   * Get user by username (not implemented - no username column in DB)
   * @private
   */
  static async getUserByUsername(username) {
    // Username column doesn't exist in actual DB, return null
    return null;
  }

  /**
   * Get user by ID
   * @param {number} userId - User ID
   * @returns {object|null} User data or null
   * @private
   */
  static async getUserById(userId) {
    const query = `SELECT * FROM users WHERE alanyaID = ? LIMIT 1`;
    return await db.getOne(query, [userId]);
  }

  /**
   * Search users by query (phone or username)
   * @param {string} query - Search query
   * @param {number} limit - Results limit
   * @param {number} offset - Offset for pagination
   * @returns {array} Array of users
   */
  static async searchUsers(query, limit = 50, offset = 0) {
    const searchTerm = `%${query}%`;
    const sqlQuery = `
      SELECT alanyaID, alanyaPhone, nom, pseudo, avatar_url, type_compte, created_at
      FROM users
      WHERE alanyaPhone LIKE ? OR nom LIKE ? OR pseudo LIKE ?
      LIMIT ? OFFSET ?
    `;
    return await db.getAll(sqlQuery, [searchTerm, searchTerm, searchTerm, limit, offset]);
  }

  /**
   * Check if phone number is available
   * @param {string} phoneNumber - Phone number to check
   * @returns {boolean} True if available
   */
  static async checkPhoneAvailable(phoneNumber) {
    try {
      const user = await this.getUserByPhone(phoneNumber);
      return !user;
    } catch (error) {
      logger.error({ error, phoneNumber }, 'checkPhoneAvailable failed');
      throw new Error('Unable to check phone availability');
    }
  }

  /**
   * Check if username is available
   * @param {string} username - Username to check
   * @returns {boolean} True if available
   */
  static async checkUsernameAvailable(username) {
    const user = await this.getUserByUsername(username);
    return !user;
  }

  /**
   * Generate an available random phone number for a country
   * @param {number} countryId - Country ID
   * @returns {string} Available phone number
   * @throws {Error} If unable to generate
   */
  static async generateAvailablePhoneNumber(countryId = null) {
    // The app stores local alanyaPhone values as 6 digits only.
    // Generating a prefix + 7-digit international number is invalid for
    // registration/login validation, so we must return a 6-digit number.
    if (countryId != null) {
      if (typeof countryId !== 'number' || Number.isNaN(countryId) || countryId <= 0) {
        throw new Error('VALIDATION_ERROR: Invalid country ID');
      }

      const country = await this.getCountryById(countryId);
      if (!country) {
        throw new Error('VALIDATION_ERROR: Invalid country ID');
      }
    }

    const MAX_ATTEMPTS = 20;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const randomNum = Math.floor(Math.random() * 900000) + 100000; // 6-digit random
      const phoneNumber = `${randomNum}`;

      const isAvailable = await this.checkPhoneAvailable(phoneNumber);
      if (isAvailable) {
        return phoneNumber;
      }
    }

    throw new Error('Unable to generate available phone number');
  }

  /**
   * Get country by ID
   * @param {number} countryId - Country ID
   * @returns {object|null} Country data or null
   * @private
   */
  static async getCountryById(countryId) {
    const query = `SELECT * FROM pays WHERE idPays = ? LIMIT 1`;
    return await db.getOne(query, [countryId]);
  }

  /**
   * Update user's last seen timestamp
   * @param {number} userId - User ID
   * @private
   */
  static async updateLastSeen(userId) {
    const query = `UPDATE users SET last_seen = NOW() WHERE alanyaID = ?`;
    await db.query(query, [userId]);
  }

  /**
   * Set user online status
   * @param {number} userId - User ID
   * @param {boolean} isOnline - Online status
   * @private
   */
  static async setOnlineStatus(userId, isOnline) {
    const query = `UPDATE users SET is_online = ?, last_seen = NOW() WHERE alanyaID = ?`;
    await db.query(query, [isOnline ? 1 : 0, userId]);
  }

  /**
   * Log user access (device, IP, OS)
   * @param {number} userId - User ID
   * @param {object} accessData - Device, IP, OS info
   * @private
   */
  static async logAccess(userId, accessData) {
    const { device = 'unknown', ipAddress = 'unknown', osSystem = 'unknown' } = accessData;

    const query = `
      INSERT INTO userAccess (alanyaID, device, ipAddress, osSystem, dateLogin)
      VALUES (?, ?, ?, ?, NOW())
    `;
    await db.query(query, [userId, device, ipAddress, osSystem]);
  }

  /**
   * Update FCM token for push notifications
   * @param {number} userId - User ID
   * @param {string} fcmToken - Firebase Cloud Messaging token
   * @returns {Promise<void>}
   * @throws {Error} If update fails
   */
  static async updateFCMToken(userId, fcmToken) {
    if (!userId || !fcmToken) {
      throw new Error('userId and fcmToken are required');
    }

    // ✅ Valider le format du token avant de l'enregistrer.
    // Rejette les placeholders fréquemment envoyés par les clients quand
    // Firebase n'a pas encore généré de vrai token ("undefined", "null",
    // "INDEFINI", chaîne vide, ou tout simplement trop court pour être
    // un vrai token FCM, qui dépasse généralement 100 caractères).
    const trimmed = String(fcmToken).trim();
    const PLACEHOLDER_VALUES = ['undefined', 'null', 'indefini', 'indéfini', 'n/a', 'none'];

    if (
      trimmed.length < 50 ||
      PLACEHOLDER_VALUES.includes(trimmed.toLowerCase())
    ) {
      logger.warn(
        { userId, fcmTokenPreview: trimmed.substring(0, 20) },
        'Invalid FCM token rejected - not persisted'
      );
      throw new Error('Invalid FCM token format');
    }

    const query = `UPDATE users SET fcm_token = ? WHERE alanyaID = ?`;
    await db.query(query, [trimmed, userId]);

    logger.debug({ userId }, 'FCM token updated');
  }
}

export default UserService;