/**
 * Authorization Middleware - Verify resource access permissions
 * Ensures users can only access their own resources or shared resources
 */

import db from '../db/index.js';
import { logger } from '../logger.js';

/**
 * FUNCTION VERSION - Call directly in handler (for Next.js API routes)
 * Enforces that user can only access their own resource
 * 
 * @param {number} userId - User ID from JWT
 * @param {number} resourceId - Resource ID from params
 * @throws {Error} If access denied, throws with message 'Access denied'
 * 
 * @example
 * // In handler:
 * const { id } = req.query;
 * const userId = req.user?.id;
 * 
 * try {
 *   enforceResourceOwnership(userId, id);
 *   // Continue with logic...
 * } catch (err) {
 *   return res.status(403).json({ error: err.message });
 * }
 */
export function enforceResourceOwnership(userId, resourceId) {
  if (!userId) {
    throw new Error('Unauthorized');
  }

  if (!resourceId) {
    throw new Error('Missing resource ID');
  }

  const userIdNum = Number(userId);
  const resourceIdNum = Number(resourceId);

  if (isNaN(userIdNum) || isNaN(resourceIdNum)) {
    throw new Error('Invalid ID format');
  }

  // CRITICAL: User can only access their own resource
  if (userIdNum !== resourceIdNum) {
    throw new Error('Access denied');
  }
}

/**
 * MIDDLEWARE VERSION - For use with Express-style middleware chains
 * Check that user owns the resource (by comparing IDs)
 * Prevents User A from accessing User B's profile, contacts, etc.
 * 
 * @param {string} fieldName - Parameter name to check (default: 'id')
 * @returns {Function} Middleware function
 * 
 * @example
 * export default withLogging(
 *   authMiddleware,
 *   checkResourceOwnership('id'),
 *   handler
 * );
 */
export function checkResourceOwnership(fieldName = 'id') {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[fieldName] || req.body[fieldName];
      const userId = req.user?.id;
      enforceResourceOwnership(userId, resourceId);
      next();
    } catch (err) {
      if (err.message === 'Access denied') {
        return res.status(403).json({ error: err.message });
      }
      if (err.message === 'Unauthorized') {
        return res.status(401).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message });
    }
  };
}

/**
 * FUNCTION VERSION - Call directly in handler (for Next.js API routes)
 * Enforces that user is a participant in the conversation
 * 
 * @param {number} userId - User ID from JWT
 * @param {number} conversationId - Conversation ID
 * @throws {Error} If access denied, throws with message 'Access denied'
 * 
 * @example
 * // In handler:
 * const userId = req.user?.id;
 * const conversationId = req.query.id;
 * 
 * try {
 *   await enforceConversationAccess(userId, conversationId);
 *   // Continue with logic...
 * } catch (err) {
 *   return res.status(403).json({ error: err.message });
 * }
 */
export async function enforceConversationAccess(userId, conversationId) {
  if (!userId) {
    throw new Error('Unauthorized');
  }

  if (!conversationId) {
    throw new Error('Missing conversation ID');
  }

  const userIdNum = Number(userId);
  const conversationIdNum = Number(conversationId);

  if (isNaN(userIdNum) || isNaN(conversationIdNum)) {
    throw new Error('Invalid ID format');
  }

  const isParticipant = await db.getOne(`
    SELECT 1 FROM conversation 
    WHERE conversID = ? AND (
      participantID = ? OR
      EXISTS (SELECT 1 FROM message WHERE conversationID = ? AND senderID = ?)
    )
    LIMIT 1
  `, [conversationIdNum, userIdNum, conversationIdNum, userIdNum]);

  if (!isParticipant) {
    throw new Error('Access denied');
  }
}

/**
 * MIDDLEWARE VERSION - For use with Express-style middleware chains
 * Check that user is a participant in the conversation
 * Prevents User A from reading messages in conversations they don't participate in
 * 
 * @returns {Function} Middleware function
 * 
 * @example
 * export default withLogging(
 *   authMiddleware,
 *   checkConversationAccess(),
 *   handler
 * );
 */
export function checkConversationAccess() {
  return async (req, res, next) => {
    try {
      const conversationId = req.params.id || req.query.conversationId;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!conversationId) {
        return res.status(400).json({ error: 'Missing conversation ID' });
      }

      const userIdNum = Number(userId);
      const conversationIdNum = Number(conversationId);

      // Query DB: Is user a participant in this conversation?
      // For DM: Check participantID or if user sent a message
      // For group: (future) check conversation_participants table
      const isParticipant = await db.getOne(`
        SELECT 1 FROM conversation 
        WHERE conversID = ? AND (
          participantID = ? OR
          EXISTS (SELECT 1 FROM message WHERE conversationID = ? AND senderID = ?)
        )
        LIMIT 1
      `, [conversationIdNum, userIdNum, conversationIdNum, userIdNum]);

      if (!isParticipant) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Attach conversationId to request for use in handler
      req.conversationId = conversationId;
      next();
    } catch (err) {
      logger.error(err, 'Conversation access check error');
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * FUNCTION VERSION - Call directly in handler (for Next.js API routes)
 * Enforces that user is the message author
 * 
 * @param {number} userId - User ID from JWT
 * @param {number} messageId - Message ID
 * @throws {Error} If access denied, throws with message 'Access denied'
 * 
 * @example
 * // In handler:
 * const userId = req.user?.id;
 * const messageId = req.query.messageId;
 * 
 * try {
 *   await enforceMessageOwnership(userId, messageId);
 *   // Continue with logic...
 * } catch (err) {
 *   return res.status(403).json({ error: err.message });
 * }
 */
export async function enforceMessageOwnership(userId, messageId) {
  if (!userId) {
    throw new Error('Unauthorized');
  }

  if (!messageId) {
    throw new Error('Missing message ID');
  }

  // Query DB: Who is the message author?
  const message = await db.getOne(`
    SELECT msgID, senderID FROM message WHERE msgID = ?
    LIMIT 1
  `, [messageId]);

  if (!message) {
    throw new Error('Message not found');
  }

  // CRITICAL: Only message author can edit/delete
  if (Number(message.senderID) !== Number(userId)) {
    throw new Error('Access denied');
  }
}

/**
 * MIDDLEWARE VERSION - For use with Express-style middleware chains
 * Check that user is the author of the message
 * Prevents User A from editing/deleting messages written by User B
 * 
 * @returns {Function} Middleware function
 * 
 * @example
 * export default withLogging(
 *   authMiddleware,
 *   checkMessageOwnership(),
 *   handler
 * );
 */
export function checkMessageOwnership() {
  return async (req, res, next) => {
    try {
      const messageId = req.params.messageId || req.params.id;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!messageId) {
        return res.status(400).json({ error: 'Missing message ID' });
      }

      // Query DB: Who is the message author?
      const message = await db.getOne(`
        SELECT msgID, senderID FROM message WHERE msgID = ?
        LIMIT 1
      `, [messageId]);

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // CRITICAL: Only message author can edit/delete
      if (Number(message.senderID) !== Number(userId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Attach message to request for use in handler
      req.message = message;
      next();
    } catch (err) {
      logger.error(err, 'Message ownership check error');
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * FUNCTION VERSION - Call directly in handler (for Next.js API routes)
 * Enforces that user is an organizer or participant in the call
 * 
 * @param {number} userId - User ID from JWT
 * @param {number} callId - Call/Meeting ID
 * @throws {Error} If access denied, throws with message 'Access denied'
 * 
 * @example
 * // In handler:
 * const userId = req.user?.id;
 * const callId = req.query.id;
 * 
 * try {
 *   await enforceCallPermission(userId, callId);
 *   // Continue with logic...
 * } catch (err) {
 *   return res.status(403).json({ error: err.message });
 * }
 */
export async function enforceCallPermission(userId, callId) {
  if (!userId) {
    throw new Error('Unauthorized');
  }

  if (!callId) {
    throw new Error('Missing call ID');
  }

  // Query DB: Is user organizer or participant?
  const isParticipant = await db.getOne(`
    SELECT m.idMeeting 
    FROM meeting m
    LEFT JOIN participant p ON m.idMeeting = p.idMeeting AND p.IDparticipant = ?
    WHERE m.idMeeting = ? AND (
      m.idOrganiser = ? OR p.ID IS NOT NULL
    )
    LIMIT 1
  `, [userId, callId, userId]);

  if (!isParticipant) {
    throw new Error('Access denied');
  }
}

/**
 * FUNCTION VERSION - Call directly in handler (for Next.js API routes)
 * Enforces that user is the status owner
 * 
 * @param {number} userId - User ID from JWT
 * @param {number} statusId - Status ID
 * @throws {Error} If access denied, throws with message 'Access denied'
 * 
 * @example
 * // In handler:
 * const userId = req.user?.id;
 * const statusId = req.query.id;
 * 
 * try {
 *   await enforceStatusOwnership(userId, statusId);
 *   // Continue with logic...
 * } catch (err) {
 *   return res.status(403).json({ error: err.message });
 * }
 */
export async function enforceStatusOwnership(userId, statusId) {
  if (!userId) {
    throw new Error('Unauthorized');
  }

  if (!statusId) {
    throw new Error('Missing status ID');
  }

  // Query DB: Who is the status owner?
  const status = await db.getOne(`
    SELECT ID, alanyaID FROM statut WHERE ID = ?
    LIMIT 1
  `, [statusId]);

  if (!status) {
    throw new Error('Status not found');
  }

  // CRITICAL: Only status author can delete
  if (Number(status.alanyaID) !== Number(userId)) {
    throw new Error('Access denied');
  }
}

/**
 * FUNCTION VERSION - Call directly in handler (for Next.js API routes)
 * Enforces that user can access a status (owner or contact)
 * 
 * @param {number} userId - User ID from JWT
 * @param {number} statusId - Status ID
 * @throws {Error} If access denied, throws with message 'Access denied'
 * 
 * @example
 * // In handler:
 * const userId = req.user?.id;
 * const statusId = req.query.id;
 * 
 * try {
 *   await enforceStatusAccess(userId, statusId);
 *   // Continue with logic...
 * } catch (err) {
 *   return res.status(403).json({ error: err.message });
 * }
 */
export async function enforceStatusAccess(userId, statusId) {
  if (!userId) {
    throw new Error('Unauthorized');
  }

  if (!statusId) {
    throw new Error('Missing status ID');
  }

  
  const hasAccess = await db.getOne(`
    SELECT s.ID 
    FROM statut s
    WHERE s.ID = ? AND (
      s.alanyaID = ? OR
      EXISTS (SELECT 1 FROM preferredContact pc WHERE pc.alanyaID = ? AND pc.idFriend = s.alanyaID)
    )
    LIMIT 1
  `, [statusId, userId, userId]);

  if (!hasAccess) {
    throw new Error('Access denied');
  }
}

/**
 * MIDDLEWARE VERSION - For use with Express-style middleware chains
 * Check that user is an organizer or participant in the call
 * Prevents User A from joining/ending calls they're not invited to
 * 
 * @returns {Function} Middleware function
 * 
 * @example
 * export default withLogging(
 *   authMiddleware,
 *   checkCallPermission(),
 *   handler
 * );
 */
export function checkCallPermission() {
  return async (req, res, next) => {
    try {
      const callId = req.params.id;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!callId) {
        return res.status(400).json({ error: 'Missing call ID' });
      }

      // Query DB: Is user organizer or participant?
      const isParticipant = await db.getOne(`
        SELECT m.idMeeting 
        FROM meeting m
        LEFT JOIN participant p ON m.idMeeting = p.idMeeting AND p.IDparticipant = ?
        WHERE m.idMeeting = ? AND (
          m.idOrganiser = ? OR p.ID IS NOT NULL
        )
        LIMIT 1
      `, [userId, callId, userId]);

      if (!isParticipant) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Attach callId to request for use in handler
      req.callId = callId;
      next();
    } catch (err) {
      logger.error(err, 'Call permission check error');
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

export default {
  checkResourceOwnership,
  checkConversationAccess,
  checkMessageOwnership,
  checkCallPermission,
};
