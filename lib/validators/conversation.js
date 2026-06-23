// Conversation validator
import { BaseValidator } from './base.js';
import { APP_CONSTANTS } from '../constants.js';

export class ConversationValidator extends BaseValidator {
  /**
   * Validates group name format and length
   * @param {string} groupName - Group name to validate
   * @returns {string} Valid trimmed group name
   * @throws {Error} If group name is invalid
   */
  static validateGroupName(groupName) {
    if (!groupName || typeof groupName !== 'string' || groupName.trim() === '') {
      this.throwError('Group name is required');
    }

    return this.validateLength(
      groupName,
      2,
      APP_CONSTANTS.MAX_GROUP_NAME,
      'Group name'
    );
  }

  /**
   * Validates group creation payload
   * @param {object} payload - Group creation data
   * @returns {object} Validated group data
   * @throws {Error} If any field is invalid
   */
  static validateGroupCreation(payload) {
    const { groupName, memberIds = [] } = payload;

    this.validateRequiredFields(payload, ['groupName']);

    const validatedGroupName = this.validateGroupName(groupName);
    const validatedMemberIds = this.validateMemberIds(memberIds, 1);

    return {
      groupName: validatedGroupName,
      memberIds: validatedMemberIds,
    };
  }

  /**
   * Validates member IDs for group operations
   * @param {array} memberIds - Array of member IDs
   * @param {number} minMembers - Minimum number of members required
   * @returns {array} Valid member IDs
   * @throws {Error} If invalid
   */
  static validateMemberIds(memberIds, minMembers = 1) {
    if (!Array.isArray(memberIds)) {
      this.throwError('memberIds must be an array');
    }

    if (memberIds.length < minMembers) {
      this.throwError(
        `At least ${minMembers} member(s) is required`
      );
    }

    if (memberIds.length > APP_CONSTANTS.MAX_GROUP_MEMBERS) {
      this.throwError(
        `Cannot have more than ${APP_CONSTANTS.MAX_GROUP_MEMBERS} members in a group`
      );
    }

    // Validate and deduplicate IDs
    const validatedIds = new Set();
    memberIds.forEach((id, index) => {
      try {
        const validId = this.validateId(id, `memberIds[${index}]`);
        validatedIds.add(validId);
      } catch (err) {
        this.throwError(`Invalid member ID at position ${index}: ${err.message}`);
      }
    });

    if (validatedIds.size !== memberIds.length) {
      this.throwError('Duplicate member IDs are not allowed');
    }

    return Array.from(validatedIds);
  }

  /**
   * Validates getting conversations list
   * @param {object} payload - Filter data
   * @returns {object} Validated filter data
   * @throws {Error} If any field is invalid
   */
  static validateGetConversations(payload) {
    const { limit = 50, offset = 0, search = null, archived = false } = payload;

    const validatedLimit = this.validateInteger(limit, 100, 'Limit');
    const validatedOffset = this.validateInteger(offset, null, 'Offset');
    const validatedArchived = this.validateBoolean(archived);

    return {
      limit: Math.min(validatedLimit, 100),
      offset: validatedOffset,
      search: search ? this.validateLength(search, 1, 100, 'Search term') : null,
      archived: validatedArchived,
    };
  }

  /**
   * Validates getting conversation messages
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
   * Validates updating group name
   * @param {object} payload - Update data
   * @returns {object} Validated update data
   * @throws {Error} If any field is invalid
   */
  static validateUpdateGroupName(payload) {
    const { conversationId, groupName } = payload;

    this.validateRequiredFields(payload, ['conversationId', 'groupName']);

    return {
      conversationId: this.validateId(conversationId, 'Conversation ID'),
      groupName: this.validateGroupName(groupName),
    };
  }

  /**
   * Validates updating group photo URL
   * @param {object} payload - Update data
   * @returns {object} Validated update data
   * @throws {Error} If any field is invalid
   */
  static validateUpdateGroupPhoto(payload) {
    const { conversationId, photoUrl } = payload;

    this.validateRequiredFields(payload, ['conversationId', 'photoUrl']);

    return {
      conversationId: this.validateId(conversationId, 'Conversation ID'),
      photoUrl: this.validateUrl(photoUrl),
    };
  }

  /**
   * Validates adding member to group
   * @param {object} payload - Add data
   * @returns {object} Validated add data
   * @throws {Error} If any field is invalid
   */
  static validateAddMember(payload) {
    const { conversationId, memberId } = payload;

    this.validateRequiredFields(payload, ['conversationId', 'memberId']);

    return {
      conversationId: this.validateId(conversationId, 'Conversation ID'),
      memberId: this.validateId(memberId, 'Member ID'),
    };
  }

  /**
   * Validates removing member from group
   * @param {object} payload - Remove data
   * @returns {object} Validated remove data
   * @throws {Error} If any field is invalid
   */
  static validateRemoveMember(payload) {
    const { conversationId, memberId } = payload;

    this.validateRequiredFields(payload, ['conversationId', 'memberId']);

    return {
      conversationId: this.validateId(conversationId, 'Conversation ID'),
      memberId: this.validateId(memberId, 'Member ID'),
    };
  }

  /**
   * Validates bulk adding members to group
   * @param {object} payload - Bulk add data
   * @returns {object} Validated bulk data
   * @throws {Error} If any field is invalid
   */
  static validateBulkAddMembers(payload) {
    const { conversationId, memberIds } = payload;

    this.validateRequiredFields(payload, ['conversationId', 'memberIds']);

    return {
      conversationId: this.validateId(conversationId, 'Conversation ID'),
      memberIds: this.validateMemberIds(memberIds, 1),
    };
  }

  /**
   * Validates archiving a conversation
   * @param {object} payload - Archive data
   * @returns {object} Validated archive data
   * @throws {Error} If any field is invalid
   */
  static validateArchiveConversation(payload) {
    const { conversationId } = payload;

    this.validateRequiredFields(payload, ['conversationId']);

    return {
      conversationId: this.validateId(conversationId, 'Conversation ID'),
    };
  }

  /**
   * Validates unarchiving a conversation
   * @param {object} payload - Unarchive data
   * @returns {object} Validated unarchive data
   * @throws {Error} If any field is invalid
   */
  static validateUnarchiveConversation(payload) {
    const { conversationId } = payload;

    this.validateRequiredFields(payload, ['conversationId']);

    return {
      conversationId: this.validateId(conversationId, 'Conversation ID'),
    };
  }

  /**
   * Validates muting a conversation
   * @param {object} payload - Mute data
   * @returns {object} Validated mute data
   * @throws {Error} If any field is invalid
   */
  static validateMuteConversation(payload) {
    const { conversationId, duration = null } = payload;

    this.validateRequiredFields(payload, ['conversationId']);

    const validDurations = [
      null, // Forever
      15, // 15 minutes
      60, // 1 hour
      480, // 8 hours
      1440, // 1 day
      10080, // 1 week
    ];

    return {
      conversationId: this.validateId(conversationId, 'Conversation ID'),
      duration:
        duration === null
          ? null
          : this.validateEnum(
              duration,
              validDurations,
              'Mute duration'
            ),
    };
  }

  /**
   * Validates unmuting a conversation
   * @param {object} payload - Unmute data
   * @returns {object} Validated unmute data
   * @throws {Error} If any field is invalid
   */
  static validateUnmuteConversation(payload) {
    const { conversationId } = payload;

    this.validateRequiredFields(payload, ['conversationId']);

    return {
      conversationId: this.validateId(conversationId, 'Conversation ID'),
    };
  }

  /**
   * Validates leaving a group conversation
   * @param {object} payload - Leave data
   * @returns {object} Validated leave data
   * @throws {Error} If any field is invalid
   */
  static validateLeaveConversation(payload) {
    const { conversationId } = payload;

    this.validateRequiredFields(payload, ['conversationId']);

    return {
      conversationId: this.validateId(conversationId, 'Conversation ID'),
    };
  }

  /**
   * Validates deleting a conversation
   * @param {object} payload - Delete data
   * @returns {object} Validated delete data
   * @throws {Error} If any field is invalid
   */
  static validateDeleteConversation(payload) {
    const { conversationId } = payload;

    this.validateRequiredFields(payload, ['conversationId']);

    return {
      conversationId: this.validateId(conversationId, 'Conversation ID'),
    };
  }

  /**
   * Validates clearing conversation history
   * @param {object} payload - Clear data
   * @returns {object} Validated clear data
   * @throws {Error} If any field is invalid
   */
  static validateClearHistory(payload) {
    const { conversationId } = payload;

    this.validateRequiredFields(payload, ['conversationId']);

    return {
      conversationId: this.validateId(conversationId, 'Conversation ID'),
    };
  }

  /**
   * Validates getting group members
   * @param {object} payload - Query data
   * @returns {object} Validated query data
   * @throws {Error} If any field is invalid
   */
  static validateGetMembers(payload) {
    const { conversationId, limit = 50, offset = 0, search = null } = payload;

    this.validateRequiredFields(payload, ['conversationId']);

    const validatedLimit = this.validateInteger(limit, 100, 'Limit');
    const validatedOffset = this.validateInteger(offset, null, 'Offset');

    return {
      conversationId: this.validateId(conversationId, 'Conversation ID'),
      limit: Math.min(validatedLimit, 100),
      offset: validatedOffset,
      search: search ? this.validateLength(search, 1, 50, 'Search term') : null,
    };
  }
}

export default ConversationValidator;
