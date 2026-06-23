// Contact service - Handle preferred contacts and blocked users
import db from '../db/index.js';
import { validate, safeValidate } from '../validators/index.js';
import { API_MESSAGES } from '../utils/error-codes.js';

export class ContactService {
  /**
   * Add a contact to preferred contacts
   * @param {number} userId - User ID
   * @param {number} friendId - Friend user ID to add
   * @returns {object} Success message
   * @throws {Error} If operation fails
   */
  static async addContact(userId, friendId) {
    validate.addContact({ userId, friendId });

    if (userId === friendId) {
      throw new Error('Cannot add yourself as a contact');
    }

    // Check if already contact
    const isContact = await this.isContact(userId, friendId);
    if (isContact) {
      throw new Error('User is already in your contacts');
    }

    // Generate idPrefContact (manual ID generation)
    const maxResult = await db.getOne('SELECT MAX(idPrefContact) as maxId FROM preferredContact');
    const nextId = (maxResult?.maxId || 0) + 1;

    const query = `
      INSERT INTO preferredContact (idPrefContact, alanyaID, idFriend, created_at)
      VALUES (?, ?, ?, NOW())
    `;

    await db.query(query, [nextId, userId, friendId]);

    return {
      friendId,
      message: 'Contact added successfully',
    };
  }

  /**
   * Remove a contact from preferred contacts
   * @param {number} userId - User ID
   * @param {number} friendId - Friend user ID to remove
   * @returns {object} Success message
   * @throws {Error} If operation fails
   */
  static async removeContact(userId, friendId) {
    validate.removeContact({ userId, friendId });

    const query = `
      DELETE FROM preferredContact WHERE alanyaID = ? AND idFriend = ?
    `;

    await db.query(query, [userId, friendId]);

    return {
      friendId,
      message: 'Contact removed successfully',
    };
  }

  /**
   * Get user's preferred contacts with pagination
   * @param {number} userId - User ID
   * @param {number} limit - Results limit
   * @param {number} offset - Offset
   * @param {string} search - Optional search term
   * @returns {array} Contacts list
   */
  static async getContacts(userId, limit = 50, offset = 0, search = null) {
    let query = `
      SELECT u.alanyaID, u.alanyaPhone, u.nom, u.pseudo, u.avatar_url, u.is_online, u.last_seen,
             pc.created_at
      FROM preferredContact pc
      INNER JOIN users u ON pc.idFriend = u.alanyaID
      WHERE pc.alanyaID = ?
    `;

    const params = [userId];

    if (search) {
      query += ` AND (u.nom LIKE ? OR u.pseudo LIKE ? OR u.alanyaPhone LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    query += ` ORDER BY u.pseudo ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    return await db.getAll(query, params);
  }

  /**
   * Check if user is in another user's contacts
   * @param {number} userId - User ID
   * @param {number} friendId - Friend user ID
   * @returns {boolean} True if contact
   */
  static async isContact(userId, friendId) {
    const query = `
      SELECT COUNT(*) as count FROM preferredContact
      WHERE alanyaID = ? AND idFriend = ?
    `;

    const row = await db.getOne(query, [userId, friendId]);
    return (row?.count || 0) > 0;
  }

  /**
   * Add multiple contacts at once
   * @param {number} userId - User ID
   * @param {array} friendIds - Array of friend IDs to add
   * @returns {object} Success message with count
   */
  static async bulkAddContacts(userId, friendIds) {
    // Generate IDs for all contacts
    const maxResult = await db.getOne('SELECT MAX(idPrefContact) as maxId FROM preferredContact');
    let nextId = (maxResult?.maxId || 0) + 1;

    const query = `
      INSERT IGNORE INTO preferredContact (idPrefContact, alanyaID, idFriend, created_at)
      VALUES (?, ?, ?, NOW())
    `;

    const promises = friendIds.map(friendId => {
      const currentId = nextId++;
      return db.query(query, [currentId, userId, friendId]);
    });
    await Promise.all(promises);

    return {
      addedCount: friendIds.length,
      message: `${friendIds.length} contact(s) added`,
    };
  }

  /**
   * Remove multiple contacts at once
   * @param {number} userId - User ID
   * @param {array} friendIds - Array of friend IDs to remove
   * @returns {object} Success message with count
   */
  static async bulkRemoveContacts(userId, friendIds) {
    const query = `
      DELETE FROM preferredContact WHERE alanyaID = ? AND idFriend = ?
    `;

    const promises = friendIds.map(friendId => db.query(query, [userId, friendId]));
    await Promise.all(promises);

    return {
      removedCount: friendIds.length,
      message: `${friendIds.length} contact(s) removed`,
    };
  }

  /**
   * Block a user
   * @param {number} userId - User ID doing the blocking
   * @param {number} blockedUserId - User ID to block
   * @param {string} reason - Optional reason for blocking
   * @returns {object} Success message
   * @throws {Error} If operation fails
   */
  static async blockUser(userId, blockedUserId, reason = null) {
    validate.blockUser({ userId, blockedUserId });

    if (userId === blockedUserId) {
      throw new Error('Cannot block yourself');
    }

    // Check if already blocked
    const isBlocked = await this.isUserBlocked(userId, blockedUserId);
    if (isBlocked) {
      throw new Error('User is already blocked');
    }

    const query = `
      INSERT INTO blocked (alanyaID, idCallerBlock, dateBlock)
      VALUES (?, ?, NOW())
    `;

    await db.query(query, [userId, blockedUserId]);

    return {
      blockedUserId,
      message: 'User blocked successfully',
    };
  }

  /**
   * Unblock a user
   * @param {number} userId - User ID doing the unblocking
   * @param {number} blockedUserId - User ID to unblock
   * @returns {object} Success message
   * @throws {Error} If operation fails
   */
  static async unblockUser(userId, blockedUserId) {
    validate.unblockUser({ userId, blockedUserId });

    const query = `
      DELETE FROM blocked WHERE alanyaID = ? AND idCallerBlock = ?
    `;

    await db.query(query, [userId, blockedUserId]);

    return {
      blockedUserId,
      message: 'User unblocked successfully',
    };
  }

  /**
   * Get user's blocked users with pagination
   * @param {number} userId - User ID
   * @param {number} limit - Results limit
   * @param {number} offset - Offset
   * @returns {array} Blocked users list
   */
  static async getBlockedUsers(userId, limit = 50, offset = 0) {
    const query = `
      SELECT u.alanyaID, u.nom, u.pseudo, u.avatar_url, b.dateBlock
      FROM blocked b
      INNER JOIN users u ON b.idCallerBlock = u.alanyaID
      WHERE b.alanyaID = ?
      ORDER BY b.dateBlock DESC
      LIMIT ? OFFSET ?
    `;

    return await db.getAll(query, [userId, limit, offset]);
  }

  /**
   * Check if user is blocked by another user
   * @param {number} userId - User ID
   * @param {number} blockedUserId - Blocked user ID
   * @returns {boolean} True if blocked
   */
  static async isUserBlocked(userId, blockedUserId) {
    const query = `
      SELECT COUNT(*) as count FROM blocked
      WHERE alanyaID = ? AND idCallerBlock = ?
    `;

    const row = await db.getOne(query, [userId, blockedUserId]);
    return (row?.count || 0) > 0;
  }

  /**
   * Sync contacts from device (by phone numbers)
   * @param {number} userId - User ID
   * @param {array} phoneNumbers - Array of phone numbers to sync
   * @returns {object} Sync result with matched users
   */
  static async syncContactsFromDevice(userId, phoneNumbers) {
    const placeholders = phoneNumbers.map(() => '?').join(',');
    const query = `
      SELECT alanyaID, alanyaPhone, nom, pseudo, avatar_url
      FROM users
      WHERE alanyaPhone IN (${placeholders})
    `;

    const matchedUsers = await db.getAll(query, phoneNumbers);

    // Bulk add these contacts
    if (matchedUsers.length > 0) {
      const friendIds = matchedUsers.map((u) => u.alanyaID);
      const insertQuery = `
        INSERT IGNORE INTO preferredContact (alanyaID, idFriend, created_at)
        VALUES (?, ?, NOW())
      `;

      const promises = friendIds.map(friendId => db.query(insertQuery, [userId, friendId]));
      await Promise.all(promises);

      return {
        matchedCount: matchedUsers.length,
        matchedUsers,
        message: `${matchedUsers.length} contact(s) synced`,
      };
    } else {
      return {
        matchedCount: 0,
        matchedUsers: [],
        message: 'No matching contacts found',
      };
    }
  }

  static async getContactList(userId) {
    const query = `
      SELECT u.alanyaID, u.alanyaPhone, u.nom, u.pseudo, u.avatar_url,
             u.is_online, u.last_seen, u.type_compte, pc.created_at
      FROM preferredContact pc
      INNER JOIN users u ON pc.idFriend = u.alanyaID
      WHERE pc.alanyaID = ?
      ORDER BY u.pseudo ASC
    `;

    return await db.getAll(query, [userId]);
  }

  /**
   * Search contacts by query
   * @param {number} userId - User ID
   * @param {string} queryStr - Search query
   * @param {number} limit - Results limit
   * @param {number} offset - Offset
   * @returns {array} Matching contacts
   */
  static async searchContacts(userId, queryStr, limit = 50, offset = 0) {
    const searchTerm = `%${queryStr}%`;
    const sql = `
      SELECT u.alanyaID, u.alanyaPhone, u.nom, u.pseudo, u.avatar_url, u.is_online, pc.created_at
      FROM preferredContact pc
      INNER JOIN users u ON pc.idFriend = u.alanyaID
      WHERE pc.alanyaID = ? AND (u.nom LIKE ? OR u.pseudo LIKE ? OR u.alanyaPhone LIKE ?)
      ORDER BY u.pseudo ASC
      LIMIT ? OFFSET ?
    `;

    return await db.getAll(sql, [userId, searchTerm, searchTerm, searchTerm, limit, offset]);
  }

  /**
   * Get contact count for user
   * @param {number} userId - User ID
   * @returns {number} Contact count
   */
  static async getContactCount(userId) {
    const query = `SELECT COUNT(*) as count FROM preferredContact WHERE alanyaID = ?`;

    const row = await db.getOne(query, [userId]);
    return row?.count || 0;
  }

  /**
   * Get blocked users count for user
   * @param {number} userId - User ID
   * @returns {number} Blocked users count
   */
  static async getBlockedCount(userId) {
    const query = `SELECT COUNT(*) as count FROM blocked WHERE alanyaID = ?`;

    const row = await db.getOne(query, [userId]);
    return row?.count || 0;
  }
}

export default ContactService;
