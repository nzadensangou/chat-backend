import db from '../db/index.js';
import { validate, safeValidate } from '../validators/index.js';
import { API_MESSAGES } from '../utils/error-codes.js';
import { withTransaction, atomicCreateMessage, getNextId } from '../db/transaction-helper.js';
import socketManager from '../socket-instance.js';
import { ConversationService } from './conversation.service.js'; // si pas déjà importé en haut
import { logger } from '../logger.js'; 
import fcmService from './fcm.service.js';                 // ← NEW

export class MessageService {
  /**
   * Create a new message (ATOMIC - message creation + conversation update in one transaction)
   * @param {number} senderID - Sender user ID
   * @param {number} conversationID - Conversation ID
   * @param {object} payload - Message data
   * @returns {object} Created message data
   * @throws {Error} If creation fails - entire transaction is rolled back
   */
  static async createMessage(senderID, conversationID, payload) {
    const validData = validate.message(payload);
    const { content, type, mediaUrl } = validData;

    // Import dynamique pour éviter dépendance circulaire
    const { ConversationService } = await import('./conversation.service.js');
    
    // Check if sender is in conversation
    await ConversationService.checkUserInConversation(conversationID, senderID);

    // Execute as atomic transaction: INSERT message + UPDATE conversation
    const createdMessage = await withTransaction(async (connection) => {
      return await atomicCreateMessage(connection, {
        conversationId: conversationID,
        senderId: senderID,
        content,
        type,
        mediaUrl: mediaUrl || null,
      });
    });

    // On a besoin du destinataire à la fois pour le socket (room perso)
    // et pour la notif FCM plus bas : on le récupère une seule fois ici.
    // ⚠️ Le message est déjà en base à ce stade (transaction terminée) :
    // un échec ici (ex: conversation introuvable) ne doit JAMAIS faire
    // planter la requête HTTP. On le protège donc dans son propre try/catch,
    // avec recipientId = null en cas d'échec (le socket saute juste
    // l'émission vers la room personnelle, la room de conversation reste ok).
    let recipientId = null;
    try {
      recipientId = await ConversationService.getOtherParticipant(conversationID, senderID);
    } catch (recipientError) {
      logger.warn(
        { conversationID, error: recipientError.message },
        'Impossible de déterminer le destinataire (non bloquant)'
      );
    }

    // ===== NEW CODE - Émettre via Socket.IO =====
    // 🔍 Log de vérification détaillée pour diagnostiquer les problèmes Socket.IO
    logger.info(
      { 
        isAvailable: socketManager.isAvailable(),
        conversationID,
        recipientId,
        senderID,
        messageId: createdMessage.msgID
      },
      '🔍 DIAGNOSTIC: Socket status avant émission message:new'
    );
    
    // ✅ FIX: Utiliser setImmediate pour garantir que l'émission se fait
    // après que toute initialisation asynchrone soit complète. Cela évite
    // les race conditions où socketManager.setIO() n'aurait pas encore été
    // appelé au moment du POST.
    setImmediate(async () => {
      try {
        if (!socketManager.isAvailable()) {
          logger.warn(
            { conversationID, recipientId, messageId: createdMessage.msgID },
            '⚠️ Socket.IO NOT AVAILABLE (deferred emission) - message saved to DB but NOT emitted in real-time'
          );
          return;
        }
        
        // ✅ FIX: on émet vers DEUX rooms :
        // - `conversation:${conversationID}` : pour ceux qui ont ChatScreen
        //   ouvert sur cette conversation précise (mise à jour immédiate).
        // - `user:${recipientId}` : la room personnelle du destinataire,
        //   active tant qu'il est connecté, peu importe l'écran affiché.
        //   Sans elle, un utilisateur qui n'a pas ce chat ouvert ne reçoit
        //   rien en temps réel (il doit sortir/rentrer pour rafraîchir via
        //   l'API REST). Socket.IO dédoublonne automatiquement si un même
        //   socket appartient aux deux rooms (pas de message en double).
        const io = socketManager.getIO();
        io
          .to(`conversation:${conversationID}`)
          .to(`user:${recipientId}`)
          .emit('message:new', {
            conversationId: conversationID,
            senderId: senderID,
            content,
            type,
            mediaUrl: mediaUrl || null,
            messageId: createdMessage.msgID,
            timestamp: createdMessage.sendAt,
          });
        logger.info(
          { conversationID, recipientId, messageId: createdMessage.msgID },
          '✅ Emitted message:new to conversation room and recipient user room (via setImmediate)'
        );
      } catch (socketError) {
        logger.error(
          { 
            error: socketError.message,
            stack: socketError.stack,
            conversationID,
            messageId: createdMessage.msgID
          }, 
          '❌ Émission Socket.IO échouée (setImmediate - non bloquant)'
        );
      }
    });

    // ===== Notification push pour l'utilisateur hors-ligne =====
    // Dans createMessage(), après l'émission socket
    try {
      if (fcmService.isReady()) {  // ← vérifie avant d'appeler
        const recipient = await db.getOne(
          'SELECT fcm_token, is_online FROM users WHERE alanyaID = ?',
          [recipientId]
        );
        if (recipient?.fcm_token && !recipient.is_online) {
          const sender = await db.getOne(
            'SELECT nom, pseudo FROM users WHERE alanyaID = ?',
            [senderID]
          );
          await fcmService.sendMessageNotification(recipient.fcm_token, {
            senderName: sender?.pseudo || sender?.nom || 'Quelqu\'un',
            messagePreview: type === 'text' ? content.slice(0, 100) : `Vous a envoyé un(e) ${type}`,
            conversationId: conversationID,
          });
        }
      }
    } catch (fcmError) {
      logger.warn({ error: fcmError.message }, 'Notification FCM échouée (non bloquant)');
    }
    // ===== END NEW CODE =====

    // ===== Incrémenter le compteur de non-lus (correctif rapide, DM only) =====
    // ⚠️ `unreadCount` est une colonne UNIQUE par conversation (une seule
    // ligne partagée par les deux participants), pas un compteur par
    // utilisateur. C'est un correctif rapide, volontairement limité aux
    // DM : getConversationById() filtre déjà `isGroup = 0`, donc `conv`
    // vaut `null` pour un groupe — dans ce cas on n'incrémente rien (pas
    // de faux compteur pour les groupes, mais pas de vrai non plus : ça
    // demanderait la table conversation_participants, déjà présente dans
    // schema.js mais pas encore branchée ici).
    // Limite connue même en DM : si les deux personnes s'envoient un
    // message avant que l'une ou l'autre n'ouvre la conversation, ce
    // compteur partagé mélange les deux sens (cas rare en usage normal :
    // quelqu'un qui répond pendant que l'autre est absent).
    try {
      const conv = await ConversationService.getConversationById(conversationID);
      if (conv) {
        await db.query(
          'UPDATE conversation SET unreadCount = unreadCount + 1 WHERE conversID = ?',
          [conversationID]
        );
      }
    } catch (unreadError) {
      logger.warn(
        { error: unreadError.message },
        'Incrément unreadCount échoué (non bloquant)'
      );
    }
    // ===== END unreadCount =====

    return createdMessage;
  }

  /**
   * Edit a message
   * @param {number} msgID - Message ID
   * @param {number} senderID - Sender user ID
   * @param {object} payload - Edit data
   * @returns {object} Updated message data
   * @throws {Error} If edit fails
   */
  static async editMessage(msgID, senderID, payload) {
    const message = await this.getMessageById(msgID);
    if (!message) {
      throw new Error('Message not found');
    }

    if (message.senderID !== senderID) {
      throw new Error('You can only edit your own messages');
    }

    const validData = validate.editMessage(payload);
    const { content } = validData;

    const query = `UPDATE message SET content = ?, isEdited = 1 WHERE msgID = ?`;
    await db.query(query, [content, msgID]);

    return {
      msgID,
      content,
      isEdited: 1,
      message: 'Message edited',
    };
  }

  /**
   * Delete a message (soft delete)
   * @param {number} msgID - Message ID
   * @param {number} senderID - Sender user ID
   * @returns {object} Success message
   * @throws {Error} If deletion fails
   */
  static async deleteMessage(msgID, senderID) {
    const message = await this.getMessageById(msgID);
    if (!message) {
      throw new Error('Message not found');
    }

    if (message.senderID !== senderID) {
      throw new Error('You can only delete your own messages');
    }

    const query = `UPDATE message SET isDeleted = 1 WHERE msgID = ?`;
    await db.query(query, [msgID]);

    return {
      msgID,
      message: 'Message deleted',
    };
  }

  /**
   * Get messages from conversation with pagination
   * @param {number} conversationID - Conversation ID
   * @param {number} limit - Results limit
   * @param {number} offset - Offset
   * @returns {array} Messages list
   */
  static async getMessages(conversationID, limit = 50, offset = 0) {
    const query = `
      SELECT m.*, u.nom, u.pseudo, u.avatar_url
      FROM message m
      INNER JOIN users u ON m.senderID = u.alanyaID
      WHERE m.conversationID = ? AND m.isDeleted = 0
      ORDER BY m.sendAt DESC
      LIMIT ? OFFSET ?
    `;

    return await db.getAll(query, [conversationID, limit, offset]);
  }

  /**
   * Get message by ID
   * @param {number} msgID - Message ID
   * @returns {object|null} Message data or null
   * @private
   */
  static async getMessageById(msgID) {
    const query = `SELECT * FROM message WHERE msgID = ? LIMIT 1`;
    return await db.getOne(query, [msgID]);
  }

  /**
   * Mark message as read
   * @param {number} msgID - Message ID
   * @param {number} readerID - Reader user ID
   * @returns {object} Success message
   */
  static async markAsRead(msgID, readerID) {
    const query = `
      UPDATE message SET readAt = NOW()
      WHERE msgID = ?
    `;

    await db.query(query, [msgID]);

    // ===== NEW CODE - Émettre via Socket.IO =====
    try {
      const socket = getSocket();
      if (socket) {
        // Récupérer le message pour connaître le sender
        const message = await this.getMessageById(msgID);
        if (message) {
          socket.emit('message:read', {
            messageId: msgID,
            readBy: readerID,
            senderId: message.senderID,
          });
          logger.debug({ msgID, readerID }, 'Read receipt emitted via Socket.IO');
        }
      }
    } catch (socketError) {
      logger.warn({ error: socketError.message }, 'Socket.IO emission failed (non-critical)');
    }
    // ===== END NEW CODE =====

    return {
      msgID,
      message: 'Message marked as read',
    };
  }
  /**
   * Mark multiple messages as read
   * @param {array} msgIDs - Array of message IDs
   * @param {number} readerID - Reader user ID
   * @returns {object} Success message
   */
  static async markMultipleAsRead(msgIDs, readerID) {
    const query = `
      UPDATE message SET readAt = NOW()
      WHERE msgID = ?
    `;

    const promises = msgIDs.map(msgID => db.query(query, [msgID]));
    await Promise.all(promises);

    return {
      markedCount: msgIDs.length,
      message: `${msgIDs.length} message(s) marked as read`,
    };
  }

  /**
   * Search messages in conversation
   * @param {number} conversationID - Conversation ID
   * @param {string} searchTerm - Search term
   * @param {number} limit - Results limit
   * @param {number} offset - Offset
   * @returns {array} Matching messages
   */
  static async searchMessages(conversationID, searchTerm, limit = 50, offset = 0) {
    const term = `%${searchTerm}%`;
    const query = `
      SELECT m.*, u.nom, u.pseudo, u.avatar_url
      FROM message m
      INNER JOIN users u ON m.senderID = u.alanyaID
      WHERE m.conversationID = ? AND m.isDeleted = 0 AND m.content LIKE ?
      ORDER BY m.sendAt DESC
      LIMIT ? OFFSET ?
    `;

    return await db.getAll(query, [conversationID, term, limit, offset]);
  }

  /**
   * Forward messages to another conversation
   * @param {array} msgIDs - Message IDs to forward
   * @param {number} forwarderID - User ID forwarding
   * @param {number} targetConversationID - Target conversation ID
   * @returns {object} Success message
   */
  static async forwardMessages(msgIDs, forwarderID, targetConversationID) {
    // Import dynamique pour éviter dépendance circulaire
    const { ConversationService } = await import('./conversation.service.js');
    const { executeSelectOne, executeInsert, getNextId } = await import('../db/transaction-helper.js');
    
    // Check if forwarder is in target conversation
    await ConversationService.checkUserInConversation(targetConversationID, forwarderID);

    // Use transaction to generate msgIDs and insert
    const result = await withTransaction(async (connection) => {
      const forwardedMessages = [];

      for (const msgID of msgIDs) {
        // Get original message using promise-based helper
        const originalMsg = await executeSelectOne(
          connection,
          'SELECT content, type, mediaUrl FROM message WHERE msgID = ? AND isDeleted = 0',
          [msgID]
        );

        if (!originalMsg) {
          throw new Error(`Message ${msgID} not found or deleted`);
        }

        // Generate new msgID
        const newMsgID = await getNextId(connection, 'message', 'msgID');

        // Insert forwarded message using promise-based helper
        const insertQuery = `
          INSERT INTO message 
          (msgID, conversationID, senderID, content, type, mediaUrl, status, sendAt, isDeleted)
          VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), 0)
        `;
        await executeInsert(connection, insertQuery, [
          newMsgID,
          targetConversationID,
          forwarderID,
          originalMsg.content,
          originalMsg.type,
          originalMsg.mediaUrl,
        ]);

        forwardedMessages.push(newMsgID);
      }

      return forwardedMessages;
    });

    return {
      forwardedCount: result.length,
      forwardedMessageIds: result,
      message: `${result.length} message(s) forwarded`,
    };
  }

  /**
   * Filter messages by type
   * @param {number} conversationID - Conversation ID
   * @param {string} type - Message type (text, image, video, audio, file)
   * @param {number} limit - Results limit
   * @param {number} offset - Offset
   * @returns {array} Filtered messages
   */
  static async filterMessages(conversationID, type, limit = 50, offset = 0) {
    const query = `
      SELECT m.*, u.nom, u.pseudo, u.avatar_url
      FROM message m
      INNER JOIN users u ON m.senderID = u.alanyaID
      WHERE m.conversationID = ? AND m.type = ? AND m.isDeleted = 0
      ORDER BY m.sendAt DESC
      LIMIT ? OFFSET ?
    `;

    return await db.getAll(query, [conversationID, type, limit, offset]);
  }

  /**
   * Get message count for conversation
   * @param {number} conversationID - Conversation ID
   * @returns {number} Message count
   */
  static async getMessageCount(conversationID) {
    const query = `
      SELECT COUNT(*) as count FROM message
      WHERE conversationID = ? AND isDeleted = 0
    `;

    const row = await db.getOne(query, [conversationID]);
    return row?.count || 0;
  }

  /**
   * Delete old messages (cleanup - deletes messages older than 90 days)
   * @param {number} daysOld - Number of days to consider as old
   * @returns {object} Success message with count
   */
  static async deleteOldMessages(daysOld = 90) {
    const query = `
      UPDATE message SET isDeleted = 1
      WHERE isDeleted = 0 AND sendAt < DATE_SUB(NOW(), INTERVAL ? DAY)
    `;

    const result = await db.query(query, [daysOld]);

    return {
      deletedCount: result.affectedRows || 0,
      message: `${result.affectedRows || 0} old message(s) deleted`,
    };
  }

  /**
   * Get read receipts for a message
   * @param {number} msgID - Message ID
   * @returns {array} List of users who read the message
   */
  static async getReadReceipts(msgID) {
    const query = `
      SELECT m.msgID, m.readAt, u.alanyaID, u.nom, u.pseudo, u.avatar_url
      FROM message m
      INNER JOIN users u ON m.senderID = u.alanyaID
      WHERE m.msgID = ?
    `;

    return await db.getAll(query, [msgID]);
  }

  /**
   * Bulk delete messages (soft delete)
   * @param {array} msgIDs - Message IDs to delete
   * @param {number} userID - User ID (owner)
   * @returns {object} Success message
   */
  static async bulkDeleteMessages(msgIDs, userID) {
    const query = `
      UPDATE message SET isDeleted = 1
      WHERE msgID = ? AND senderID = ? AND isDeleted = 0
    `;

    const promises = msgIDs.map(msgID => db.query(query, [msgID, userID]));
    await Promise.all(promises);

    return {
      deletedCount: msgIDs.length,
      message: `${msgIDs.length} message(s) deleted`,
    };
  }
}

export default MessageService;