// Message validator
import { BaseValidator } from './base.js';
import { MESSAGE_TYPES, MESSAGE_STATUS, MESSAGE_TYPE_CODES, APP_CONSTANTS } from '../constants.js';

export class MessageValidator extends BaseValidator {
  /**
   * Validates message content
   * @param {string} content - Message content to validate
   * @returns {string} Valid trimmed content
   * @throws {Error} If content is invalid
   */
  static validateContent(content) {
    if (!content || typeof content !== 'string' || content.trim() === '') {
      this.throwError('Message content is required');
    }

    return this.validateLength(
      content,
      1,
      APP_CONSTANTS.MAX_MESSAGE_LENGTH,
      'Message content'
    );
  }

  /**
   * Validates message type
   * @param {string} type - Message type to validate
   * @returns {number} Integer code for message type
   * @throws {Error} If type is invalid
   */
  static validateType(type) {
    if (!type || typeof type !== 'string') {
      this.throwError('Message type is required');
    }

    const validTypes = Object.values(MESSAGE_TYPES);
    const validatedType = this.validateEnum(
      type.toLowerCase(),
      validTypes,
      'Message type'
    );

    // Convert string type to database integer code
    const typeCode = MESSAGE_TYPE_CODES[validatedType];
    
    if (!typeCode) {
      this.throwError(`Unknown message type code for: ${validatedType}`);
    }

    return typeCode;
  }

  /**
   * Validates message status
   * @param {string} status - Message status to validate
   * @returns {string} Valid message status
   * @throws {Error} If status is invalid
   */
  static validateStatus(status) {
    if (!status || typeof status !== 'string') {
      return MESSAGE_STATUS.PENDING; // Default to pending
    }

    const validStatuses = Object.values(MESSAGE_STATUS);
    return this.validateEnum(
      status.toLowerCase(),
      validStatuses,
      'Message status'
    );
  }

  /**
   * Validates optional media URL
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
   * Validates optional media name
   * @param {string} name - Media name to validate
   * @returns {string|null} Valid name or null
   * @throws {Error} If name is invalid
   */
  static validateMediaName(name) {
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return null;
    }

    const trimmed = name.trim();

    if (trimmed.length > 255) {
      this.throwError('Media name must not exceed 255 characters');
    }

    return trimmed;
  }

  /**
   * Validates optional media duration in seconds
   * @param {number} duration - Duration to validate
   * @returns {number|null} Valid duration or null
   * @throws {Error} If duration is invalid
   */
  static validateMediaDuration(duration) {
    if (duration === null || duration === undefined) {
      return null;
    }

    if (typeof duration !== 'number' || duration < 0) {
      this.throwError('Media duration must be a non-negative number');
    }

    if (duration > 86400) { // 24 hours
      this.throwError('Media duration cannot exceed 24 hours (86400 seconds)');
    }

    return Math.floor(duration);
  }

  /**
   * Validates message creation payload
   * @param {object} payload - Message creation data
   * @returns {object} Validated message data
   * @throws {Error} If any field is invalid
   */
  static validateCreation(payload) {
    const { content, type = MESSAGE_TYPES.TEXT, mediaUrl, mediaDuration } = payload;

    this.validateRequiredFields(payload, ['content']);

    return {
      content: this.validateContent(content),
      type: this.validateType(type),
      mediaUrl: this.validateMediaUrl(mediaUrl),
      mediaDuration: this.validateMediaDuration(mediaDuration),
    };
  }

  /**
   * Validates message edit payload
   * @param {object} payload - Edit data
   * @returns {object} Validated edit data
   * @throws {Error} If any field is invalid
   */
  static validateEdit(payload) {
    const { messageId, content } = payload;

    this.validateRequiredFields(payload, ['messageId', 'content']);

    return {
      messageId: this.validateId(messageId, 'Message ID'),
      content: this.validateContent(content),
    };
  }

  /**
   * Validates message deletion payload
   * @param {object} payload - Delete data
   * @returns {object} Validated delete data
   * @throws {Error} If any field is invalid
   */
  static validateDelete(payload) {
    const { messageId, deleteForAll = false } = payload;

    this.validateRequiredFields(payload, ['messageId']);

    return {
      messageId: this.validateId(messageId, 'Message ID'),
      deleteForAll: this.validateBoolean(deleteForAll),
    };
  }

  /**
   * Validates message read receipt payload
   * @param {object} payload - Receipt data
   * @returns {object} Validated receipt data
   * @throws {Error} If any field is invalid
   */
  static validateReadReceipt(payload) {
    const { messageId } = payload;

    this.validateRequiredFields(payload, ['messageId']);

    return {
      messageId: this.validateId(messageId, 'Message ID'),
    };
  }

  /**
   * Validates bulk read receipts payload
   * @param {object} payload - Bulk receipt data
   * @returns {object} Validated bulk data
   * @throws {Error} If any field is invalid
   */
  static validateBulkReadReceipts(payload) {
    const { messageIds } = payload;

    this.validateRequiredFields(payload, ['messageIds']);

    if (!Array.isArray(messageIds)) {
      this.throwError('messageIds must be an array');
    }

    if (messageIds.length === 0) {
      this.throwError('At least one message ID is required');
    }

    if (messageIds.length > 100) {
      this.throwError('Cannot mark more than 100 messages as read at once');
    }

    const validatedIds = messageIds.map((id, index) => {
      try {
        return this.validateId(id, `messageIds[${index}]`);
      } catch (err) {
        this.throwError(`Invalid ID at position ${index}: ${err.message}`);
      }
    });

    // Check for duplicates
    const uniqueIds = new Set(validatedIds);
    if (uniqueIds.size !== validatedIds.length) {
      this.throwError('Duplicate message IDs are not allowed');
    }

    return {
      messageIds: validatedIds,
    };
  }

  /**
   * Validates getting messages from conversation
   * @param {object} payload - Query data
   * @returns {object} Validated query data
   * @throws {Error} If any field is invalid
   */
  static validateGetMessages(payload) {
    const { conversationId, limit = 50, offset = 0 } = payload;

    this.validateRequiredFields(payload, ['conversationId']);

    const validatedLimit = this.validateInteger(limit, 100, 'Limit');
    const validatedOffset = this.validateInteger(offset, null, 'Offset');

    return {
      conversationId: this.validateId(conversationId, 'Conversation ID'),
      limit: Math.min(validatedLimit, 100),
      offset: validatedOffset,
    };
  }

  /**
   * Validates message search payload
   * @param {object} payload - Search data
   * @returns {object} Validated search data
   * @throws {Error} If any field is invalid
   */
  static validateSearch(payload) {
    const { conversationId, query, limit = 50, offset = 0 } = payload;

    this.validateRequiredFields(payload, ['conversationId', 'query']);

    const validatedLimit = this.validateInteger(limit, 100, 'Limit');
    const validatedOffset = this.validateInteger(offset, null, 'Offset');

    return {
      conversationId: this.validateId(conversationId, 'Conversation ID'),
      query: this.validateLength(query, 1, 100, 'Search query'),
      limit: Math.min(validatedLimit, 100),
      offset: validatedOffset,
    };
  }

  /**
   * Validates message status update
   * @param {object} payload - Status update data
   * @returns {object} Validated update data
   * @throws {Error} If any field is invalid
   */
  static validateUpdateStatus(payload) {
    const { messageId, status } = payload;

    this.validateRequiredFields(payload, ['messageId', 'status']);

    return {
      messageId: this.validateId(messageId, 'Message ID'),
      status: this.validateStatus(status),
    };
  }

  /**
   * Validates forwarding messages
   * @param {object} payload - Forward data
   * @returns {object} Validated forward data
   * @throws {Error} If any field is invalid
   */
  static validateForwardMessages(payload) {
    const { messageIds, targetConversationId } = payload;

    this.validateRequiredFields(payload, ['messageIds', 'targetConversationId']);

    if (!Array.isArray(messageIds)) {
      this.throwError('messageIds must be an array');
    }

    if (messageIds.length === 0) {
      this.throwError('At least one message ID is required');
    }

    if (messageIds.length > 50) {
      this.throwError('Cannot forward more than 50 messages at once');
    }

    const validatedIds = messageIds.map((id, index) => {
      try {
        return this.validateId(id, `messageIds[${index}]`);
      } catch (err) {
        this.throwError(`Invalid ID at position ${index}: ${err.message}`);
      }
    });

    return {
      messageIds: validatedIds,
      targetConversationId: this.validateId(targetConversationId, 'Target Conversation ID'),
    };
  }

  /**
   * Validates message filtering
   * @param {object} payload - Filter data
   * @returns {object} Validated filter data
   * @throws {Error} If any field is invalid
   */
  static validateFilter(payload) {
    const { conversationId, type = null, status = null, limit = 50, offset = 0 } = payload;

    this.validateRequiredFields(payload, ['conversationId']);

    const validatedLimit = this.validateInteger(limit, 100, 'Limit');
    const validatedOffset = this.validateInteger(offset, null, 'Offset');

    return {
      conversationId: this.validateId(conversationId, 'Conversation ID'),
      type: type ? this.validateType(type) : null,
      status: status ? this.validateStatus(status) : null,
      limit: Math.min(validatedLimit, 100),
      offset: validatedOffset,
    };
  }

  /**
   * Validates deleting bulk messages
   * @param {object} payload - Bulk delete data
   * @returns {object} Validated bulk data
   * @throws {Error} If any field is invalid
   */
  static validateBulkDelete(payload) {
    const { messageIds, deleteForAll = false } = payload;

    this.validateRequiredFields(payload, ['messageIds']);

    if (!Array.isArray(messageIds)) {
      this.throwError('messageIds must be an array');
    }

    if (messageIds.length === 0) {
      this.throwError('At least one message ID is required');
    }

    if (messageIds.length > 100) {
      this.throwError('Cannot delete more than 100 messages at once');
    }

    const validatedIds = messageIds.map((id, index) => {
      try {
        return this.validateId(id, `messageIds[${index}]`);
      } catch (err) {
        this.throwError(`Invalid ID at position ${index}: ${err.message}`);
      }
    });

    return {
      messageIds: validatedIds,
      deleteForAll: this.validateBoolean(deleteForAll),
    };
  }
}

export default MessageValidator;