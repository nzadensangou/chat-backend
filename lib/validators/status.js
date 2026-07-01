// Status (story) validator
import { BaseValidator } from './base.js';
import { STATUS_TYPE, APP_CONSTANTS, VALIDATION_PATTERNS } from '../constants.js';

export class StatusValidator extends BaseValidator {
  /**
   * Validates status text content
   * @param {string} text - Status text to validate
   * @returns {string} Valid trimmed text
   * @throws {Error} If text is invalid
   */
  static validateText(text) {
    if (!text || typeof text !== 'string' || text.trim() === '') {
      this.throwError('Status content is required');
    }

    return this.validateLength(
      text,
      1,
      APP_CONSTANTS.MAX_STATUS_LENGTH,
      'Status content'
    );
  }

  /**
   * Validates status type
   * @param {string} type - Status type to validate
   * @returns {string} Valid status type
   * @throws {Error} If type is invalid
   */
  static validateType(type) {
    if (!type || typeof type !== 'string') {
      this.throwError('Status type is required');
    }

    const validTypes = Object.values(STATUS_TYPE);
    return this.validateEnum(
      type.toLowerCase(),
      validTypes,
      'Status type'
    );
  }

  /**
   * Validates background color for text status
   * @param {string} color - Hex color code to validate
   * @returns {string} Valid uppercase hex color
   * @throws {Error} If color is invalid
   */
  static validateBackgroundColor(color) {
    if (!color || typeof color !== 'string' || color.trim() === '') {
      return '#FFFFFF'; // Default white color
    }

    return this.validateColor(color);
  }

  /**
   * Validates optional media URL for status
   * @param {string} url - Media URL to validate
   * @returns {string|null} Valid URL or null
   * @throws {Error} If URL is invalid
   */
  static validateMediaUrl(url) {
    if (!url || typeof url !== 'string' || url.trim() === '') {
      return null;
    }

    return this.validateUrl(url);
  }

  /**
   * Validates status creation payload
   * @param {object} payload - Status creation data
   * @returns {object} Validated status data
   * @throws {Error} If any field is invalid
   */
  static validateCreation(payload) {
    const { text, type = STATUS_TYPE.TEXT, mediaUrl = null, backgroundColor = '#FFFFFF' } = payload;

    const mediaUrlValue = this.validateMediaUrl(mediaUrl);
    const hasText = typeof text === 'string' && text.trim() !== '';

    if (!hasText && !mediaUrlValue) {
      this.throwError('Status text or mediaUrl is required');
    }

    return {
      text: hasText ? this.validateText(text) : null,
      type: this.validateType(type),
      mediaUrl: mediaUrlValue,
      backgroundColor: this.validateBackgroundColor(backgroundColor),
    };
  }

  /**
   * Validates getting user's stories
   * @param {object} payload - Query data
   * @returns {object} Validated query data
   * @throws {Error} If any field is invalid
   */
  static validateGetStories(payload) {
    const { userId, limit = 50, offset = 0 } = payload;

    this.validateRequiredFields(payload, ['userId']);

    const validatedLimit = this.validateInteger(limit, 100, 'Limit');
    const validatedOffset = this.validateInteger(offset, null, 'Offset');

    return {
      userId: this.validateId(userId, 'User ID'),
      limit: Math.min(validatedLimit, 100),
      offset: validatedOffset,
    };
  }

  /**
   * Validates viewing a story
   * @param {object} payload - View data
   * @returns {object} Validated view data
   * @throws {Error} If any field is invalid
   */
  static validateViewStatus(payload) {
    const { statusId } = payload;

    this.validateRequiredFields(payload, ['statusId']);

    return {
      statusId: this.validateId(statusId, 'Status ID'),
    };
  }

  /**
   * Validates bulk viewing stories
   * @param {object} payload - Bulk view data
   * @returns {object} Validated bulk data
   * @throws {Error} If any field is invalid
   */
  static validateBulkViewStatuses(payload) {
    const { statusIds } = payload;

    this.validateRequiredFields(payload, ['statusIds']);

    if (!Array.isArray(statusIds)) {
      this.throwError('statusIds must be an array');
    }

    if (statusIds.length === 0) {
      this.throwError('At least one status ID is required');
    }

    if (statusIds.length > 100) {
      this.throwError('Cannot view more than 100 stories at once');
    }

    const validatedIds = statusIds.map((id, index) => {
      try {
        return this.validateId(id, `statusIds[${index}]`);
      } catch (err) {
        this.throwError(`Invalid ID at position ${index}: ${err.message}`);
      }
    });

    // Check for duplicates
    const uniqueIds = new Set(validatedIds);
    if (uniqueIds.size !== validatedIds.length) {
      this.throwError('Duplicate status IDs are not allowed');
    }

    return {
      statusIds: validatedIds,
    };
  }

  /**
   * Validates deleting a story
   * @param {object} payload - Delete data
   * @returns {object} Validated delete data
   * @throws {Error} If any field is invalid
   */
  static validateDelete(payload) {
    const { statusId } = payload;

    this.validateRequiredFields(payload, ['statusId']);

    return {
      statusId: this.validateId(statusId, 'Status ID'),
    };
  }

  /**
   * Validates bulk deleting stories
   * @param {object} payload - Bulk delete data
   * @returns {object} Validated bulk data
   * @throws {Error} If any field is invalid
   */
  static validateBulkDelete(payload) {
    const { statusIds } = payload;

    this.validateRequiredFields(payload, ['statusIds']);

    if (!Array.isArray(statusIds)) {
      this.throwError('statusIds must be an array');
    }

    if (statusIds.length === 0) {
      this.throwError('At least one status ID is required');
    }

    if (statusIds.length > 100) {
      this.throwError('Cannot delete more than 100 stories at once');
    }

    const validatedIds = statusIds.map((id, index) => {
      try {
        return this.validateId(id, `statusIds[${index}]`);
      } catch (err) {
        this.throwError(`Invalid ID at position ${index}: ${err.message}`);
      }
    });

    return {
      statusIds: validatedIds,
    };
  }

  /**
   * Validates getting story viewers
   * @param {object} payload - Query data
   * @returns {object} Validated query data
   * @throws {Error} If any field is invalid
   */
  static validateGetViewers(payload) {
    const { statusId, limit = 50, offset = 0 } = payload;

    this.validateRequiredFields(payload, ['statusId']);

    const validatedLimit = this.validateInteger(limit, 100, 'Limit');
    const validatedOffset = this.validateInteger(offset, null, 'Offset');

    return {
      statusId: this.validateId(statusId, 'Status ID'),
      limit: Math.min(validatedLimit, 100),
      offset: validatedOffset,
    };
  }

  /**
   * Validates hiding story from specific user
   * @param {object} payload - Hide data
   * @returns {object} Validated hide data
   * @throws {Error} If any field is invalid
   */
  static validateHideFromUser(payload) {
    const { statusId, userId } = payload;

    this.validateRequiredFields(payload, ['statusId', 'userId']);

    return {
      statusId: this.validateId(statusId, 'Status ID'),
      userId: this.validateId(userId, 'User ID'),
    };
  }

  /**
   * Validates getting stories from followers/contacts
   * @param {object} payload - Query data
   * @returns {object} Validated query data
   * @throws {Error} If any field is invalid
   */
  static validateGetContactStories(payload) {
    const { limit = 50, offset = 0 } = payload;

    const validatedLimit = this.validateInteger(limit, 100, 'Limit');
    const validatedOffset = this.validateInteger(offset, null, 'Offset');

    return {
      limit: Math.min(validatedLimit, 100),
      offset: validatedOffset,
    };
  }

  /**
   * Validates searching stories
   * @param {object} payload - Search data
   * @returns {object} Validated search data
   * @throws {Error} If any field is invalid
   */
  static validateSearch(payload) {
    const { query, limit = 50, offset = 0 } = payload;

    this.validateRequiredFields(payload, ['query']);

    const validatedLimit = this.validateInteger(limit, 100, 'Limit');
    const validatedOffset = this.validateInteger(offset, null, 'Offset');

    return {
      query: this.validateLength(query, 1, 100, 'Search query'),
      limit: Math.min(validatedLimit, 100),
      offset: validatedOffset,
    };
  }

  /**
   * Validates getting story by ID
   * @param {object} payload - Query data
   * @returns {object} Validated query data
   * @throws {Error} If any field is invalid
   */
  static validateGetById(payload) {
    const { statusId } = payload;

    this.validateRequiredFields(payload, ['statusId']);

    return {
      statusId: this.validateId(statusId, 'Status ID'),
    };
  }

  /**
   * Validates reporting a story
   * @param {object} payload - Report data
   * @returns {object} Validated report data
   * @throws {Error} If any field is invalid
   */
  static validateReport(payload) {
    const { statusId, reason, description = null } = payload;

    this.validateRequiredFields(payload, ['statusId', 'reason']);

    const validReasons = [
      'inappropriate',
      'spam',
      'hate_speech',
      'violence',
      'harassment',
      'copyright',
      'other',
    ];

    return {
      statusId: this.validateId(statusId, 'Status ID'),
      reason: this.validateEnum(reason, validReasons, 'Report reason'),
      description: description
        ? this.validateLength(description, 1, 500, 'Report description')
        : null,
    };
  }

  /**
   * Validates getting story statistics (views, etc.)
   * @param {object} payload - Stats query data
   * @returns {object} Validated query data
   * @throws {Error} If any field is invalid
   */
  static validateGetStats(payload) {
    const { statusId } = payload;

    this.validateRequiredFields(payload, ['statusId']);

    return {
      statusId: this.validateId(statusId, 'Status ID'),
    };
  }

  /**
   * Validates filtering stories by type
   * @param {object} payload - Filter data
   * @returns {object} Validated filter data
   * @throws {Error} If any field is invalid
   */
  static validateFilter(payload) {
    const { userId, type = null, limit = 50, offset = 0 } = payload;

    this.validateRequiredFields(payload, ['userId']);

    const validatedLimit = this.validateInteger(limit, 100, 'Limit');
    const validatedOffset = this.validateInteger(offset, null, 'Offset');

    return {
      userId: this.validateId(userId, 'User ID'),
      type: type ? this.validateType(type) : null,
      limit: Math.min(validatedLimit, 100),
      offset: validatedOffset,
    };
  }

  /**
   * Validates setting story visibility
   * @param {object} payload - Visibility data
   * @returns {object} Validated visibility data
   * @throws {Error} If any field is invalid
   */
  static validateSetVisibility(payload) {
    const { statusId, visibility = 'public' } = payload;

    this.validateRequiredFields(payload, ['statusId']);

    const validVisibilities = ['public', 'contacts_only', 'private'];

    return {
      statusId: this.validateId(statusId, 'Status ID'),
      visibility: this.validateEnum(visibility, validVisibilities, 'Visibility'),
    };
  }

  /**
   * Validates story expiration check
   * @param {object} payload - Expiry check data
   * @returns {object} Validated data
   * @throws {Error} If any field is invalid
   */
  static validateCheckExpiry(payload) {
    const { statusId } = payload;

    this.validateRequiredFields(payload, ['statusId']);

    return {
      statusId: this.validateId(statusId, 'Status ID'),
    };
  }
}

export default StatusValidator;
