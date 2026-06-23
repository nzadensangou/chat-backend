// Contact validator
import { BaseValidator } from './base.js';

export class ContactValidator extends BaseValidator {
  /**
   * Validates adding a contact to preferred contacts
   * @param {object} payload - Contact data
   * @returns {object} Validated add contact data
   * @throws {Error} If any field is invalid
   */
  static validateAddContact(payload) {
    const { friendId } = payload;

    this.validateRequiredFields(payload, ['friendId']);

    const validatedFriendId = this.validateId(friendId, 'Friend ID');

    // Prevent adding yourself as contact
    if (this.isUserAddingSelf) {
      this.throwError('Cannot add yourself as a contact');
    }

    return {
      friendId: validatedFriendId,
    };
  }

  /**
   * Validates removing a contact from preferred contacts
   * @param {object} payload - Contact data
   * @returns {object} Validated remove contact data
   * @throws {Error} If any field is invalid
   */
  static validateRemoveContact(payload) {
    const { friendId } = payload;

    this.validateRequiredFields(payload, ['friendId']);

    return {
      friendId: this.validateId(friendId, 'Friend ID'),
    };
  }

  /**
   * Validates blocking a user
   * @param {object} payload - Block data
   * @returns {object} Validated block data
   * @throws {Error} If any field is invalid
   */
  static validateBlockUser(payload) {
    const { blockedUserId, reason } = payload;

    this.validateRequiredFields(payload, ['blockedUserId']);

    const validatedBlockedId = this.validateId(blockedUserId, 'User ID');

    return {
      blockedUserId: validatedBlockedId,
      reason: reason
        ? this.validateLength(reason, 1, 200, 'Block reason')
        : null,
    };
  }

  /**
   * Validates unblocking a user
   * @param {object} payload - Unblock data
   * @returns {object} Validated unblock data
   * @throws {Error} If any field is invalid
   */
  static validateUnblockUser(payload) {
    const { blockedUserId } = payload;

    this.validateRequiredFields(payload, ['blockedUserId']);

    return {
      blockedUserId: this.validateId(blockedUserId, 'User ID'),
    };
  }

  /**
   * Validates getting contacts list
   * @param {object} payload - Filter data
   * @returns {object} Validated filter data
   * @throws {Error} If any field is invalid
   */
  static validateGetContacts(payload) {
    const { limit = 50, offset = 0, search = null, sortBy = 'createdAt' } = payload;

    const validatedLimit = this.validateInteger(limit, 500, 'Limit');
    const validatedOffset = this.validateInteger(offset, null, 'Offset');
    const validSortOptions = ['createdAt', 'username', 'nom'];

    return {
      limit: Math.min(validatedLimit, 500), // Max 500 per request
      offset: validatedOffset,
      search: search ? this.validateLength(search, 1, 50, 'Search term') : null,
      sortBy: this.validateEnum(sortBy, validSortOptions, 'Sort field'),
    };
  }

  /**
   * Validates getting blocked users list
   * @param {object} payload - Filter data
   * @returns {object} Validated filter data
   * @throws {Error} If any field is invalid
   */
  static validateGetBlockedUsers(payload) {
    const { limit = 50, offset = 0, search = null } = payload;

    const validatedLimit = this.validateInteger(limit, 500, 'Limit');
    const validatedOffset = this.validateInteger(offset, null, 'Offset');

    return {
      limit: Math.min(validatedLimit, 500),
      offset: validatedOffset,
      search: search ? this.validateLength(search, 1, 50, 'Search term') : null,
    };
  }

  /**
   * Validates contact operations with another user
   * @param {object} payload - Operation data
   * @returns {object} Validated operation data
   * @throws {Error} If any field is invalid
   */
  static validateContactOperation(payload) {
    const { userId, operation } = payload;

    this.validateRequiredFields(payload, ['userId', 'operation']);

    const validOperations = ['add', 'remove', 'block', 'unblock'];
    const validatedUserId = this.validateId(userId, 'User ID');

    return {
      userId: validatedUserId,
      operation: this.validateEnum(
        operation.toLowerCase(),
        validOperations,
        'Operation'
      ),
    };
  }

  /**
   * Validates bulk add contacts
   * @param {object} payload - Bulk add data
   * @returns {object} Validated bulk data
   * @throws {Error} If any field is invalid
   */
  static validateBulkAddContacts(payload) {
    const { friendIds } = payload;

    this.validateRequiredFields(payload, ['friendIds']);

    if (!Array.isArray(friendIds)) {
      this.throwError('friendIds must be an array');
    }

    if (friendIds.length === 0) {
      this.throwError('At least one friend ID is required');
    }

    if (friendIds.length > 100) {
      this.throwError('Cannot add more than 100 contacts at once');
    }

    // Validate each ID
    const validatedIds = friendIds.map((id, index) => {
      try {
        return this.validateId(id, `friendIds[${index}]`);
      } catch (err) {
        this.throwError(`Invalid ID at position ${index}: ${err.message}`);
      }
    });

    // Check for duplicates
    const uniqueIds = new Set(validatedIds);
    if (uniqueIds.size !== validatedIds.length) {
      this.throwError('Duplicate friend IDs are not allowed');
    }

    return {
      friendIds: validatedIds,
    };
  }

  /**
   * Validates bulk remove contacts
   * @param {object} payload - Bulk remove data
   * @returns {object} Validated bulk data
   * @throws {Error} If any field is invalid
   */
  static validateBulkRemoveContacts(payload) {
    const { friendIds } = payload;

    this.validateRequiredFields(payload, ['friendIds']);

    if (!Array.isArray(friendIds)) {
      this.throwError('friendIds must be an array');
    }

    if (friendIds.length === 0) {
      this.throwError('At least one friend ID is required');
    }

    if (friendIds.length > 100) {
      this.throwError('Cannot remove more than 100 contacts at once');
    }

    // Validate each ID
    const validatedIds = friendIds.map((id, index) => {
      try {
        return this.validateId(id, `friendIds[${index}]`);
      } catch (err) {
        this.throwError(`Invalid ID at position ${index}: ${err.message}`);
      }
    });

    // Check for duplicates
    const uniqueIds = new Set(validatedIds);
    if (uniqueIds.size !== validatedIds.length) {
      this.throwError('Duplicate friend IDs are not allowed');
    }

    return {
      friendIds: validatedIds,
    };
  }

  /**
   * Validates checking if user is contact
   * @param {object} payload - Check data
   * @returns {object} Validated check data
   * @throws {Error} If any field is invalid
   */
  static validateIsContact(payload) {
    const { userId } = payload;

    this.validateRequiredFields(payload, ['userId']);

    return {
      userId: this.validateId(userId, 'User ID'),
    };
  }

  /**
   * Validates checking if user is blocked
   * @param {object} payload - Check data
   * @returns {object} Validated check data
   * @throws {Error} If any field is invalid
   */
  static validateIsBlocked(payload) {
    const { userId } = payload;

    this.validateRequiredFields(payload, ['userId']);

    return {
      userId: this.validateId(userId, 'User ID'),
    };
  }

  /**
   * Validates contact sync from device
   * @param {object} payload - Sync data
   * @returns {object} Validated sync data
   * @throws {Error} If any field is invalid
   */
  static validateContactSync(payload) {
    const { contacts } = payload;

    this.validateRequiredFields(payload, ['contacts']);

    if (!Array.isArray(contacts)) {
      this.throwError('contacts must be an array');
    }

    if (contacts.length === 0) {
      return { contacts: [] };
    }

    if (contacts.length > 1000) {
      this.throwError('Cannot sync more than 1000 contacts at once');
    }

    const validatedContacts = contacts.map((contact, index) => {
      if (typeof contact !== 'object' || contact === null) {
        this.throwError(`contacts[${index}] must be an object`);
      }

      const { phoneNumber, name } = contact;

      if (!phoneNumber || typeof phoneNumber !== 'string') {
        this.throwError(
          `contacts[${index}].phoneNumber is required and must be a string`
        );
      }

      return {
        phoneNumber: phoneNumber.trim(),
        name: name ? this.sanitize(name) : null,
      };
    });

    return {
      contacts: validatedContacts,
    };
  }
}

export default ContactValidator;
