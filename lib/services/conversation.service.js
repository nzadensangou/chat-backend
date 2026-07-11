// Conversation service - Handle conversations (DM and groups) management
import db from '../db/index.js';
import { validate, safeValidate } from '../validators/index.js';
import { API_MESSAGES } from '../utils/error-codes.js';
import { withTransaction, atomicCreateConversation } from '../db/transaction-helper.js';

// Helper: Parse participant string "1,2,3" to array [1,2,3]
function parseParticipants(participantStr) {
  if (!participantStr) return [];
  // Convert to string if it's a number (MySQL returns INT sometimes)
  const str = String(participantStr);
  return str.split(',').map(id => Number(id)).filter(id => !isNaN(id));
}

// Helper: Convert participant array to string "1,2,3"
function serializeParticipants(participants) {
  if (!Array.isArray(participants)) return '';
  return participants.map(Number).filter(id => !isNaN(id)).join(',');
}

export class ConversationService {
  /**
   * ✅ FIX (bug "la nouvelle conversation ne s'affiche pas correctement") :
   * createDirectMessage() et getDirectMessageConversation() renvoyaient
   * chacun une forme différente (appauvrie) de conversation — sans `name`,
   * `avatar`, `lastMessage`, ni `lastMessageAt` — alors que getConversations()
   * (utilisé pour la liste sur la page Messages) renvoie une forme enrichie.
   * Résultat côté Flutter : la conversation fraîchement créée arrivait avec
   * un nom vide et une position de tri peu fiable, ce qui la faisait
   * paraître absente/cassée dans la liste. On centralise donc le mapping
   * "ligne SQL -> objet conversation" ici, pour que CRÉATION et LISTING
   * renvoient systématiquement exactement la même forme.
   * @private
   */
  static _mapConversationRow(row, userId) {
    const iAmRecipient = row.participantID === userId;
    const otherNom = iAmRecipient ? row.creatorNom : row.recipientNom;
    const otherPseudo = iAmRecipient ? row.creatorPseudo : row.recipientPseudo;
    const otherAvatar = iAmRecipient ? row.creatorAvatar : row.recipientAvatar;
    const otherUserId = iAmRecipient ? row.creatorID : row.participantID;

    return {
      conversID: row.conversID,
      isDM: true,
      otherUserId: otherUserId,
      name: otherNom || otherPseudo || 'Inconnu',
      avatar: otherAvatar,
      lastMessage: row.lastMessage,
      lastMessageType: row.lastMessageType,
      lastMessageAt: row.lastMessageAt,
      isPinned: row.isPinned,
      isArchived: row.isArchived,
      unreadCount: row.unreadCount,
    };
  }

  /**
   * Renvoie une conversation DM unique, enrichie exactement comme dans
   * getConversations() — utilisé juste après création (ou récupération
   * d'une conversation déjà existante) pour que la réponse envoyée au
   * client ait toujours la même forme que la liste.
   * @private
   */
  static async _getEnrichedConversation(conversID, userId) {
    const query = `
      SELECT c.conversID, c.participantID, c.isGroup, c.lastMessage, c.lastMessageType, c.lastMessageAt, c.isPinned, c.isArchived, c.unreadCount,
              recipient.alanyaID AS recipientID, recipient.nom AS recipientNom, recipient.pseudo AS recipientPseudo, recipient.avatar_url AS recipientAvatar,
              (
                SELECT m.senderID FROM message m
                WHERE m.conversationID = c.conversID AND m.isDeleted = 1
                LIMIT 1
              ) AS creatorID,
              creator.nom AS creatorNom, creator.pseudo AS creatorPseudo, creator.avatar_url AS creatorAvatar
      FROM conversation c
      LEFT JOIN users recipient ON recipient.alanyaID = c.participantID
      LEFT JOIN users creator ON creator.alanyaID = (
        SELECT m.senderID FROM message m
        WHERE m.conversationID = c.conversID AND m.isDeleted = 1
        LIMIT 1
      )
      WHERE c.conversID = ?
      LIMIT 1
    `;
    const row = await db.getOne(query, [conversID]);
    if (!row) return null;
    return this._mapConversationRow(row, userId);
  }

  /**
   * Create a new group conversation
   * NOTE: Groups not supported - participantID is INT column, cannot store comma-separated values
   * @throws {Error} Always throws
   */
  static async createGroup(creatorId, payload) {
    throw new Error('GROUP_CONVERSATIONS_NOT_SUPPORTED: Only direct messages (1-to-1) are supported. The database schema does not allow group conversations.');
  }

  /**
   * Create or get direct message conversation (DM only)
   * For DM: participantID stores only the recipient ID (creator known from JWT)
   * @param {number} userId1 - User creating the DM
   * @param {number} userId2 - Recipient user ID
   * @returns {object} Conversation data
   * @throws {Error} If creation fails
   */
  static async createDirectMessage(userId1, userId2) {
    if (userId1 === userId2) {
      throw new Error('Cannot create DM with yourself');
    }

    // Check if DM already exists
    const existing = await this.getDirectMessageConversation(userId1, userId2);
    if (existing) {
      // ✅ FIX : renvoie la même forme enrichie que getConversations(),
      // pas les colonnes brutes de `SELECT c.*`.
      return this._getEnrichedConversation(existing.conversID, userId1);
    }

    // Create conversation atomically
    const conversation = await withTransaction(async (connection) => {
      return await atomicCreateConversation(connection, {
        creatorId: userId1,
        participantIds: [userId2], // For DM: only recipient stored
        name: '',
        isGroup: false,
      });
    });

    // ✅ FIX (bug "la nouvelle conversation ne s'affiche pas correctement") :
    // avant, on renvoyait ici { conversID, isDM, creator, recipient,
    // message } — une forme totalement différente de celle utilisée par
    // getConversations() (sans `name`, `avatar`, `lastMessage`,
    // `lastMessageAt`...). Le client recevait donc une conversation
    // incomplète juste après sa création. On renvoie maintenant exactement
    // la même forme enrichie que la liste, pour un affichage immédiat et
    // cohérent.
    const enriched = await this._getEnrichedConversation(conversation.conversID, userId1);
    if (!enriched) {
      throw new Error('CONVERSATION_CREATION_FAILED: Unable to load created conversation');
    }
    return enriched;
  }

  /**
   * Get user's conversations with pagination (DM only)
   * @param {number} userId - User ID
   * @param {number} limit - Results limit
   * @param {number} offset - Offset
   * @param {object} filters - Filter options (archived, search)
   * @returns {array} Conversations list
   */
  
  static async getConversations(userId, limit = 50, offset = 0, filters = {}) {
    const { archived = false, search = null } = filters;

    let query = `
      SELECT c.conversID, c.participantID, c.isGroup, c.lastMessage, c.lastMessageType, c.lastMessageAt, c.isPinned, c.isArchived, c.unreadCount,
              recipient.alanyaID AS recipientID, recipient.nom AS recipientNom, recipient.pseudo AS recipientPseudo, recipient.avatar_url AS recipientAvatar,
              (
                -- Marqueur d'appartenance du créateur : voir le commentaire
                -- sur atomicCreateConversation() dans transaction-helper.js.
                -- isDeleted = 1 est ICI intentionnel (pas une inversion de
                -- convention) : il cible spécifiquement le message-marqueur
                -- invisible inséré à la création, pas un vrai message.
                SELECT m.senderID FROM message m
                WHERE m.conversationID = c.conversID AND m.isDeleted = 1
                LIMIT 1
              ) AS creatorID,
              creator.nom AS creatorNom, creator.pseudo AS creatorPseudo, creator.avatar_url AS creatorAvatar
      FROM conversation c
      LEFT JOIN users recipient ON recipient.alanyaID = c.participantID
      LEFT JOIN users creator ON creator.alanyaID = (
        SELECT m.senderID FROM message m
        WHERE m.conversationID = c.conversID AND m.isDeleted = 1
        LIMIT 1
      )
      WHERE c.isGroup = 0 AND c.isArchived = ?
        AND (
          c.participantID = ?
          OR EXISTS (SELECT 1 FROM message m2 WHERE m2.conversationID = c.conversID AND m2.senderID = ? AND m2.isDeleted = 1)
        )
    `;

    const params = [archived ? 1 : 0, userId, userId];

    if (search) {
      query += ` AND c.GroupName LIKE ?`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY c.lastMessageAt DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await db.getAll(query, params);
    // ✅ Réutilise le même mapping que _getEnrichedConversation() (voir
    // plus haut) : liste ET création renvoient désormais systématiquement
    // exactement la même forme d'objet conversation.
    return (rows || []).map(row => this._mapConversationRow(row, userId));
  }

  /**
   * Get conversation by ID (DM only)
   * @param {number} conversID - Conversation ID
   * @returns {object|null} Conversation data
   */
  static async getConversationById(conversID) {
    const query = `SELECT * FROM conversation WHERE conversID = ? AND isGroup = 0 LIMIT 1`;
    const row = await db.getOne(query, [conversID]);
    if (!row) return null;
    return {
      conversID: row.conversID,
      isDM: true,
      otherUserId: row.participantID,
      lastMessage: row.lastMessage,
      lastMessageType: row.lastMessageType,
      lastMessageAt: row.lastMessageAt,
      isPinned: row.isPinned,
      isArchived: row.isArchived,
      unreadCount: row.unreadCount,
    };
  }

  /**
   * Get messages from conversation
   * @param {number} conversID - Conversation ID
   * @param {number} limit - Results limit
   * @param {number} offset - Offset
   * @returns {array} Messages list
   */
  static async getConversationMessages(conversID, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM message
      WHERE conversationID = ? AND isDeleted = 0
      ORDER BY sendAt DESC
      LIMIT ? OFFSET ?
    `;
    const rows = await db.getAll(query, [conversID, limit, offset]);
    return rows || [];
  }

  /**
   * Update group name - NOT SUPPORTED for DM-only mode
   * @throws {Error} Always throws
   */
  static async updateGroupName(conversID, userId, newName) {
    throw new Error('GROUP_FEATURE_NOT_SUPPORTED: Only direct messages are supported in this version.');
  }

  /**
   * Update group photo - NOT SUPPORTED for DM-only mode
   * @throws {Error} Always throws
   */
  static async updateGroupPhoto(conversID, userId, photoUrl) {
    throw new Error('GROUP_FEATURE_NOT_SUPPORTED: Only direct messages are supported in this version.');
  }

  /**
   * Add member - NOT SUPPORTED for DM-only mode
   * @throws {Error} Always throws
   */
  static async addMember(conversID, userId, newMemberId) {
    throw new Error('GROUP_FEATURE_NOT_SUPPORTED: Only direct messages are supported in this version.');
  }

  /**
   * Remove member - NOT SUPPORTED for DM-only mode
   * @throws {Error} Always throws
   */
  static async removeMember(conversID, userId, memberId) {
    throw new Error('GROUP_FEATURE_NOT_SUPPORTED: Only direct messages are supported in this version.');
  }

  /**
   * Add multiple members - NOT SUPPORTED for DM-only mode
   * @throws {Error} Always throws
   */
  static async bulkAddMembers(conversID, userId, memberIds) {
    throw new Error('GROUP_FEATURE_NOT_SUPPORTED: Only direct messages are supported in this version.');
  }

  /**
   * Get conversation members (DM only - returns the other user)
   * @param {number} conversID - Conversation ID
   * @param {number} limit - Results limit (ignored for DM)
   * @param {number} offset - Offset (ignored for DM)
   * @returns {array} Members list (just the other user)
   */
  static async getMembers(conversID, limit = 50, offset = 0) {
    const conv = await this.getConversationById(conversID);
    if (!conv) throw new Error('Conversation not found');

    // For DM: return just the other user
    const query = `
      SELECT alanyaID, nom, pseudo, avatar_url
      FROM users
      WHERE alanyaID = ?
      LIMIT 1
    `;
    const rows = await db.getAll(query, [conv.otherUserId]);
    return rows || [];
  }

  /**
   * Retourne l'ID de l'autre participant d'une conversation DM,
   * en fonction de qui est l'expéditeur (senderId)
   *
   * Limitation du schéma : la table conversation ne stocke qu'un seul
   * participantID (le destinataire initial). Si l'expéditeur actuel
   * EST ce destinataire, on retrouve le créateur via le premier message
   * enregistré dans la conversation (msgID le plus bas).
   *
   * @param {number} conversID - Conversation ID
   * @param {number} senderId - ID de l'utilisateur qui envoie le message
   * @returns {number|null} ID de l'autre utilisateur
   */
  static async getOtherParticipant(conversID, senderId) {
    const conv = await this.getConversationById(conversID);
    if (!conv) throw new Error('Conversation not found');

    if (conv.otherUserId !== senderId) {
      return conv.otherUserId;
    }

    const creatorRow = await db.getOne(
      `SELECT senderID FROM message WHERE conversationID = ? ORDER BY msgID ASC LIMIT 1`,
      [conversID]
    );
    return creatorRow?.senderID || null;
  }

  /**
   * Get member count (DM only - always 2 for active DM)
   * @param {number} conversID - Conversation ID
   * @returns {number} Member count (2 for DM)
   */
  static async getMemberCount(conversID) {
    const conv = await this.getConversationById(conversID);
    if (!conv) return 0;
    return 2; // DM always has 2 members
  }

  /**
   * Archive conversation
   * @param {number} conversID - Conversation ID
   * @param {number} userId - User ID
   * @returns {object} Success message
   */
  static async archiveConversation(conversID, userId) {
    const query = `UPDATE conversation SET isArchived = 1 WHERE conversID = ?`;
    await db.query(query, [conversID]);

    return { message: 'Conversation archived' };
  }

  /**
   * Unarchive conversation
   * @param {number} conversID - Conversation ID
   * @param {number} userId - User ID
   * @returns {object} Success message
   */
  static async unarchiveConversation(conversID, userId) {
    const query = `UPDATE conversation SET isArchived = 0 WHERE conversID = ?`;
    await db.query(query, [conversID]);

    return { message: 'Conversation unarchived' };
  }

  /**
   * Mute conversation for duration (in minutes)
   * @param {number} conversationId - Conversation ID
   * @param {number} userId - User ID
   * @param {number|null} duration - Mute duration in minutes (null = forever)
   * @returns {object} Success message
   */
  static async muteConversation(conversationId, userId, duration = null) {
    // TODO: Implement mute logic with timestamp
    return { message: 'Conversation muted', duration };
  }

  /**
   * Unmute conversation
   * @param {number} conversationId - Conversation ID
   * @param {number} userId - User ID
   * @returns {object} Success message
   */
  static async unmuteConversation(conversationId, userId) {
    // TODO: Implement unmute logic
    return { message: 'Conversation unmuted' };
  }

  /**
   * Leave conversation (DM only - delete it)
   * @param {number} conversID - Conversation ID
   * @param {number} userId - User ID
   * @returns {object} Success message
   */
  static async leaveConversation(conversID, userId) {
    await this.checkUserInConversation(conversID, userId);
    
    // For DM: delete entire conversation
    await db.query(`DELETE FROM conversation WHERE conversID = ?`, [conversID]);

    return { message: 'Conversation deleted' };
  }

  /**
   * Delete conversation (soft delete for user)
   * @param {number} conversID - Conversation ID
   * @param {number} userId - User ID
   * @returns {object} Success message
   */
  static async deleteConversation(conversID, userId) {
    // Soft delete - just remove from user's view by making them leave
    return this.leaveConversation(conversID, userId);
  }

  /**
   * Clear conversation history for user
   * @param {number} conversID - Conversation ID
   * @param {number} userId - User ID
   * @returns {object} Success message
   */
  static async clearHistory(conversID, userId) {
    await this.checkUserInConversation(conversID, userId);

    const query = `
      UPDATE message SET isDeleted = 1 WHERE conversationID = ?
    `;
    await db.query(query, [conversID]);

    return { message: 'Conversation history cleared' };
  }

  /**
   * Search conversations (DM only - search by user name)
   * @param {number} userId - User ID
   * @param {string} searchQuery - Search query
   * @param {number} limit - Results limit
   * @param {number} offset - Offset
   * @returns {array} Matching conversations
   */
  static async searchConversations(userId, searchQuery, limit = 50, offset = 0) {
    const searchTerm = `%${searchQuery}%`;
    const sql = `
      SELECT c.* FROM conversation c
      WHERE c.isGroup = 0
        AND (
          c.participantID = ? OR EXISTS (SELECT 1 FROM message m WHERE m.conversationID = c.conversID AND m.senderID = ?)
        )
        AND EXISTS (
          SELECT 1 FROM users u WHERE u.alanyaID = c.participantID AND u.nom LIKE ?
        )
      ORDER BY c.lastMessageAt DESC
      LIMIT ? OFFSET ?
    `;
    const rows = await db.getAll(sql, [userId, userId, searchTerm, limit, offset]);
    return (rows || []).map(row => ({
      conversID: row.conversID,
      isDM: true,
      otherUserId: row.participantID,
      lastMessage: row.lastMessage,
      lastMessageAt: row.lastMessageAt,
    }));
  }

  /**
   * Get unread message count for conversation
   * @param {number} conversID - Conversation ID
   * @param {number} userId - User ID
   * @returns {number} Unread count
   */
  static async getUnreadCount(conversID, userId) {
    const conv = await this.getConversationById(conversID);
    if (!conv) return 0;
    return conv.unreadCount || 0;
  }

  /**
   * Mark conversation as read
   * @param {number} conversID - Conversation ID
   * @param {number} userId - User ID
   * @returns {object} Success message
   */
  static async markAsRead(conversID, userId) {
    const query = `
      UPDATE conversation SET unreadCount = 0
      WHERE conversID = ?
    `;
    await db.query(query, [conversID]);

    return { message: 'Marked as read' };
  }

  /**
   * Check if user is in conversation (DM only)
   * User is a member if:
   * - They are the recipient (participantID = userId), OR
   * - They have sent at least one message in this conversation
   * @param {number} conversID - Conversation ID
   * @param {number} userId - User ID
   * @returns {boolean} True if user is member
   * @private
   */
  static async isUserInConversation(conversID, userId) {
    const query = `
      SELECT 1 FROM conversation c
      WHERE c.conversID = ? AND c.isGroup = 0
        AND (
          c.participantID = ?
          OR EXISTS (SELECT 1 FROM message m WHERE m.conversationID = c.conversID AND m.senderID = ?)
        )
      LIMIT 1
    `;
    const result = await db.getOne(query, [conversID, userId, userId]);
    return !!result;
  }

  /**
   * Check user in conversation and throw if not
   * @param {number} conversID - Conversation ID
   * @param {number} userId - User ID
   * @throws {Error} If user not in conversation
   * @private
   */
  static async checkUserInConversation(conversID, userId) {
    const isMember = await this.isUserInConversation(conversID, userId);
    if (!isMember) {
      throw new Error('You are not a member of this conversation');
    }
  }

  /**
   * Get or create direct message conversation (DM only)
   * @param {number} userId1 - First user ID
   * @param {number} userId2 - Second user ID
   * @returns {object|null} Conversation data
   * @private
   */
  static async getDirectMessageConversation(userId1, userId2) {
  // For DM: participantID = recipient ID only.
  // The CREATOR is identified specifically via the hidden system message
  // (isDeleted = 1) inserted at creation time — NOT via "any message this
  // user happens to have sent".
  // We also order by conversID ASC and LIMIT 1 so that, if duplicate
  // DM conversations exist between the same two users, we deterministically
  // always return the oldest one.
  const query = `
    SELECT c.* FROM conversation c
    WHERE c.isGroup = 0
      AND (
        (c.participantID = ? AND EXISTS (
          SELECT 1 FROM message m
          WHERE m.conversationID = c.conversID AND m.senderID = ? AND m.isDeleted = 1
        ))
        OR
        (c.participantID = ? AND EXISTS (
          SELECT 1 FROM message m
          WHERE m.conversationID = c.conversID AND m.senderID = ? AND m.isDeleted = 1
        ))
      )
    ORDER BY c.conversID ASC
    LIMIT 1
  `;
  const row = await db.getOne(query, [userId2, userId1, userId1, userId2]);
  if (!row) return null;
    return {
      conversID: row.conversID,
      isDM: true,
      creator: row.participantID === userId2 ? userId1 : userId2,
      recipient: row.participantID,
      lastMessage: row.lastMessage,
      lastMessageAt: row.lastMessageAt,
    };
  }
}

export default ConversationService;