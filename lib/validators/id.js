// ID validator
import { BaseValidator } from './base.js';

export class IdValidator extends BaseValidator {
  /**
   * Validates user ID
   * @param {number} id - User ID to validate
   * @returns {number} Valid user ID
   * @throws {Error} If ID is invalid
   */
  static validateUserId(id) {
    return this.validateId(id, 'User ID');
  }

  /**
   * Validates country ID
   * @param {number} id - Country ID to validate
   * @returns {number} Valid country ID
   * @throws {Error} If ID is invalid
   */
  static validateCountryId(id) {
    return this.validateId(id, 'Country ID');
  }

  /**
   * Validates conversation ID
   * @param {number} id - Conversation ID to validate
   * @returns {number} Valid conversation ID
   * @throws {Error} If ID is invalid
   */
  static validateConversationId(id) {
    return this.validateId(id, 'Conversation ID');
  }

  /**
   * Validates message ID
   * @param {number} id - Message ID to validate
   * @returns {number} Valid message ID
   * @throws {Error} If ID is invalid
   */
  static validateMessageId(id) {
    return this.validateId(id, 'Message ID');
  }

  /**
   * Validates status (story) ID
   * @param {number} id - Status ID to validate
   * @returns {number} Valid status ID
   * @throws {Error} If ID is invalid
   */
  static validateStatusId(id) {
    return this.validateId(id, 'Status ID');
  }

  /**
   * Validates meeting ID
   * @param {number} id - Meeting ID to validate
   * @returns {number} Valid meeting ID
   * @throws {Error} If ID is invalid
   */
  static validateMeetingId(id) {
    return this.validateId(id, 'Meeting ID');
  }

  /**
   * Validates block record ID
   * @param {number} id - Block ID to validate
   * @returns {number} Valid block ID
   * @throws {Error} If ID is invalid
   */
  static validateBlockId(id) {
    return this.validateId(id, 'Block ID');
  }

  /**
   * Validates preferred contact ID
   * @param {number} id - Contact ID to validate
   * @returns {number} Valid contact ID
   * @throws {Error} If ID is invalid
   */
  static validateContactId(id) {
    return this.validateId(id, 'Contact ID');
  }

  /**
   * Validates participant ID
   * @param {number} id - Participant ID to validate
   * @returns {number} Valid participant ID
   * @throws {Error} If ID is invalid
   */
  static validateParticipantId(id) {
    return this.validateId(id, 'Participant ID');
  }

  /**
   * Validates call history record ID
   * @param {number} id - Call ID to validate
   * @returns {number} Valid call ID
   * @throws {Error} If ID is invalid
   */
  static validateCallId(id) {
    return this.validateId(id, 'Call ID');
  }

  /**
   * Validates access log ID
   * @param {number} id - Access log ID to validate
   * @returns {number} Valid access log ID
   * @throws {Error} If ID is invalid
   */
  static validateAccessId(id) {
    return this.validateId(id, 'Access Log ID');
  }

  /**
   * Validates group ID
   * @param {number} id - Group ID to validate
   * @returns {number} Valid group ID
   * @throws {Error} If ID is invalid
   */
  static validateGroupId(id) {
    return this.validateId(id, 'Group ID');
  }

  /**
   * Validates array of user IDs
   * @param {array} ids - Array of user IDs
   * @param {number} minCount - Minimum number of IDs
   * @param {number} maxCount - Maximum number of IDs
   * @returns {array} Valid array of user IDs
   * @throws {Error} If invalid
   */
  static validateUserIdArray(ids, minCount = 1, maxCount = 1000) {
    return this.validateIdArray(ids, minCount, 'User IDs');
  }

  /**
   * Validates array of conversation IDs
   * @param {array} ids - Array of conversation IDs
   * @param {number} minCount - Minimum number of IDs
   * @returns {array} Valid array of conversation IDs
   * @throws {Error} If invalid
   */
  static validateConversationIdArray(ids, minCount = 1) {
    return this.validateIdArray(ids, minCount, 'Conversation IDs');
  }

  /**
   * Validates array of message IDs
   * @param {array} ids - Array of message IDs
   * @param {number} minCount - Minimum number of IDs
   * @returns {array} Valid array of message IDs
   * @throws {Error} If invalid
   */
  static validateMessageIdArray(ids, minCount = 1) {
    return this.validateIdArray(ids, minCount, 'Message IDs');
  }

  /**
   * Validates array of status IDs
   * @param {array} ids - Array of status IDs
   * @param {number} minCount - Minimum number of IDs
   * @returns {array} Valid array of status IDs
   * @throws {Error} If invalid
   */
  static validateStatusIdArray(ids, minCount = 1) {
    return this.validateIdArray(ids, minCount, 'Status IDs');
  }

  /**
   * Validates that two IDs are different (not same)
   * @param {number} id1 - First ID
   * @param {number} id2 - Second ID
   * @param {string} field1Name - First field name
   * @param {string} field2Name - Second field name
   * @throws {Error} If IDs are the same
   */
  static validateDifferentIds(id1, id2, field1Name = 'ID 1', field2Name = 'ID 2') {
    const validId1 = this.validateId(id1, field1Name);
    const validId2 = this.validateId(id2, field2Name);

    if (validId1 === validId2) {
      this.throwError(`${field1Name} and ${field2Name} cannot be the same`);
    }

    return { id1: validId1, id2: validId2 };
  }

  /**
   * Validates that ID is within expected range
   * @param {number} id - ID to validate
   * @param {number} minId - Minimum ID value
   * @param {number} maxId - Maximum ID value
   * @param {string} fieldName - Field name
   * @returns {number} Valid ID
   * @throws {Error} If ID is out of range
   */
  static validateIdRange(id, minId, maxId, fieldName = 'ID') {
    const validId = this.validateId(id, fieldName);

    if (validId < minId || validId > maxId) {
      this.throwError(
        `${fieldName} must be between ${minId} and ${maxId}`
      );
    }

    return validId;
  }

  /**
   * Validates ID exists in a set of valid IDs
   * @param {number} id - ID to validate
   * @param {array} validIds - Array of valid IDs
   * @param {string} fieldName - Field name
   * @returns {number} Valid ID
   * @throws {Error} If ID not in valid set
   */
  static validateIdInSet(id, validIds, fieldName = 'ID') {
    const validId = this.validateId(id, fieldName);

    if (!validIds.includes(validId)) {
      this.throwError(
        `${fieldName} must be one of: ${validIds.join(', ')}`
      );
    }

    return validId;
  }

  /**
   * Validates ID pair (sender and receiver)
   * @param {object} payload - Payload with senderId and receiverId
   * @returns {object} Validated IDs
   * @throws {Error} If invalid
   */
  static validateSenderReceiverId(payload) {
    const { senderId, receiverId } = payload;

    this.validateRequiredFields(payload, ['senderId', 'receiverId']);

    const validSenderId = this.validateUserId(senderId);
    const validReceiverId = this.validateUserId(receiverId);

    if (validSenderId === validReceiverId) {
      this.throwError('Sender and receiver cannot be the same user');
    }

    return {
      senderId: validSenderId,
      receiverId: validReceiverId,
    };
  }

  /**
   * Validates caller and receiver IDs
   * @param {object} payload - Payload with callerId and receiverId
   * @returns {object} Validated IDs
   * @throws {Error} If invalid
   */
  static validateCallerReceiverId(payload) {
    const { callerId, receiverId } = payload;

    this.validateRequiredFields(payload, ['callerId', 'receiverId']);

    const validCallerId = this.validateUserId(callerId);
    const validReceiverId = this.validateUserId(receiverId);

    if (validCallerId === validReceiverId) {
      this.throwError('Caller and receiver cannot be the same user');
    }

    return {
      callerId: validCallerId,
      receiverId: validReceiverId,
    };
  }

  /**
   * Validates owner and target IDs (for blocking, etc.)
   * @param {object} payload - Payload with ownerId and targetId
   * @returns {object} Validated IDs
   * @throws {Error} If invalid
   */
  static validateOwnerTargetId(payload) {
    const { ownerId, targetId } = payload;

    this.validateRequiredFields(payload, ['ownerId', 'targetId']);

    const validOwnerId = this.validateUserId(ownerId);
    const validTargetId = this.validateUserId(targetId);

    if (validOwnerId === validTargetId) {
      this.throwError('Owner and target cannot be the same user');
    }

    return {
      ownerId: validOwnerId,
      targetId: validTargetId,
    };
  }

  /**
   * Validates resource access permissions (admin/owner check)
   * @param {number} resourceOwnerId - ID of resource owner
   * @param {number} requestingUserId - ID of requesting user
   * @throws {Error} If user is not the owner
   */
  static validateOwnership(resourceOwnerId, requestingUserId) {
    const validOwnerId = this.validateId(resourceOwnerId, 'Resource Owner ID');
    const validUserId = this.validateId(requestingUserId, 'Requesting User ID');

    if (validOwnerId !== validUserId) {
      this.throwError('You do not have permission to access this resource');
    }
  }

  /**
   * Validates pagination IDs (limit and offset)
   * @param {number} limit - Items per page
   * @param {number} offset - Starting offset
   * @param {number} maxLimit - Maximum allowed limit
   * @returns {object} Validated pagination IDs
   * @throws {Error} If invalid
   */
  static validatePagination(limit, offset, maxLimit = 100) {
    const validLimit = this.validateInteger(limit, maxLimit, 'Limit');
    const validOffset = this.validateInteger(offset, null, 'Offset');

    return {
      limit: Math.min(validLimit, maxLimit),
      offset: validOffset,
    };
  }
}

export default IdValidator;
