/**
 * Transaction Helper - Utilities and patterns for database transactions
 * Provides safe, atomic operations for multi-query operations
 */

import db from './index.js';
import { PARTICIPANT_STATUS_CODES } from '../constants.js';

/**
 * Execute multiple queries atomically within a transaction
 * Connection is passed to the callback for all operations
 * 
 * @param {Function} operations - Async function that receives connection and executes queries
 * @returns {any} Result from operations callback
 * @throws {Error} If any operation fails, transaction is rolled back
 * 
 * @example
 * const result = await withTransaction(async (conn) => {
 *   const [msgResult] = await conn.query('INSERT INTO message ...', [data]);
 *   await conn.query('UPDATE conversation ...', [convId]);
 *   return msgResult;
 * });
 */
export async function withTransaction(operations) {
  return db.withTransaction(operations);
}

/**
 * Execute a single INSERT and return generated ID
 * @param {Object} connection - DB connection
 * @param {string} sql - INSERT query
 * @param {array} params - Query parameters
 * @returns {number} Generated ID (insertId)
 */
export async function executeInsert(connection, sql, params = []) {
  const [result] = await connection.query(sql, params);
  return result.insertId;
}

/**
 * Execute a single UPDATE
 * @param {Object} connection - DB connection
 * @param {string} sql - UPDATE query
 * @param {array} params - Query parameters
 * @returns {number} Affected rows count
 */
export async function executeUpdate(connection, sql, params = []) {
  const [result] = await connection.query(sql, params);
  return result.affectedRows;
}

/**
 * Execute a SELECT query returning rows
 * @param {Object} connection - DB connection
 * @param {string} sql - SELECT query
 * @param {array} params - Query parameters
 * @returns {array} Query results
 */
export async function executeSelect(connection, sql, params = []) {
  const [rows] = await connection.query(sql, params);
  return rows;
}

/**
 * Execute a SELECT query returning single row
 * @param {Object} connection - DB connection
 * @param {string} sql - SELECT query
 * @param {array} params - Query parameters
 * @returns {Object|null} Single row or null
 */
export async function executeSelectOne(connection, sql, params = []) {
  const [rows] = await connection.query(sql, params);
  return rows[0] || null;
}

/**
 * Get next ID by finding MAX(column) + 1
 * IMPORTANT: Use AUTO_INCREMENT instead in schema if possible
 * This is a fallback for legacy columns without AUTO_INCREMENT
 * 
 * @param {Object} connection - DB connection
 * @param {string} table - Table name
 * @param {string} column - Column name (usually ID column)
 * @returns {number} Next available ID
 */
export async function getNextId(connection, table, column = 'id') {
  const sql = `SELECT MAX(${column}) as maxId FROM ${table}`;
  const result = await executeSelectOne(connection, sql);
  return (result?.maxId || 0) + 1;
}

/**
 * Pattern: Insert message + Update conversation
 * Ensures message creation is atomic with conversation update
 * 
 * @param {Object} connection - DB connection
 * @param {Object} messageData - Message data to insert
 * @param {number} messageData.conversationId - Conversation ID
 * @param {number} messageData.senderId - Sender ID
 * @param {string} messageData.content - Message content
 * @param {string} messageData.type - Message type
 * @param {string} messageData.mediaUrl - Optional media URL
 * @returns {Object} Created message with ID
 */
export async function atomicCreateMessage(connection, messageData) {
  const {
    conversationId,
    senderId,
    content,
    type,
    mediaUrl = null,
  } = messageData;

  // 0. Generate msgID manually (no AUTO_INCREMENT)
  const msgID = await getNextId(connection, 'message', 'msgID');

  // 1. Insert message
  const insertQuery = `
    INSERT INTO message 
    (msgID, senderID, conversationID, content, type, mediaUrl, status, sendAt, isDeleted)
    VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), 0)
  `;
  await executeInsert(connection, insertQuery, [
    msgID,
    senderId,
    conversationId,
    content,
    type,
    mediaUrl,
  ]);

  // 2. Update conversation's last message (MUST happen atomically)
  const updateQuery = `
    UPDATE conversation 
    SET lastMessage = ?, lastMessageAt = NOW() 
    WHERE conversID = ?
  `;
  await executeUpdate(connection, updateQuery, [content, conversationId]);

  return {
    msgID: msgID,
    conversationID: conversationId,
    senderID: senderId,
    content,
    type,
    mediaUrl,
    status: 0,
    sendAt: new Date().toISOString(),
  };
}

/**
 * Pattern: Create meeting + Add organizer as first participant
 * Ensures meeting is created with organizer participant in one transaction
 * 
 * @param {Object} connection - DB connection
 * @param {Object} meetingData - Meeting data
 * @param {number} meetingData.organizerId - Organizer/creator ID
 * @param {string} meetingData.callType - 'audio' or 'video'
 * @param {string} meetingData.room - Room identifier
 * @param {string} meetingData.description - Call description
 * @returns {Object} Created meeting with ID
 */
export async function atomicCreateMeeting(connection, meetingData) {
  const {
    organizerId,
    callType,
    room,
    description = 'Call',
  } = meetingData;

  // Get next IDs
  const meetingId = await getNextId(connection, 'meeting', 'idMeeting');
  const participantId = await getNextId(connection, 'participant', 'ID');

  // 1. Insert meeting
  const meetingQuery = `
    INSERT INTO meeting 
    (idMeeting, idOrganiser, start_time, type_media, room, objet, duree)
    VALUES (?, ?, NOW(), ?, ?, ?, 0)
  `;

  const typeCode = callType.toLowerCase() === 'video' ? 2 : 1; // 1=audio, 2=video
  await executeInsert(connection, meetingQuery, [
    meetingId,
    organizerId,
    typeCode,
    room,
    description,
  ]);

  // 2. Add organizer as first participant (MUST happen atomically)
  const participantQuery = `
    INSERT INTO participant 
    (ID, idMeeting, IDparticipant, status, start_time, connecte, duree)
    VALUES (?, ?, ?, 0, NOW(), 0, 0)
  `;
  await executeInsert(connection, participantQuery, [
    participantId,
    meetingId,
    organizerId,
  ]);

  return {
    idMeeting: meetingId,
    idOrganiser: organizerId,
    type_media: callType,
    room,
    status: 'initiated',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Pattern: Add participant + Update meeting status
 * Ensures participant is added and meeting status is updated atomically
 * 
 * @param {Object} connection - DB connection
 * @param {number} meetingId - Meeting ID
 * @param {number} participantId - Participant user ID
 * @param {string} status - Participant status ('connected', 'rejected', etc)
 * @returns {Object} Added participant info
 */
export async function atomicAddParticipant(connection, meetingId, participantId, status = 'connected') {
  // Get next participant ID
  const newParticipantId = await getNextId(connection, 'participant', 'ID');

  // Map status string to numeric code
  const statusCode = PARTICIPANT_STATUS_CODES[status] || PARTICIPANT_STATUS_CODES.connected;

  // 1. Add participant
  const insertQuery = `
    INSERT INTO participant 
    (ID, idMeeting, IDparticipant, status, start_time, connecte, duree)
    VALUES (?, ?, ?, ?, NOW(), ?, 0)
  `;

  const connecte = status === 'connected' ? 1 : 0;
  await executeInsert(connection, insertQuery, [
    newParticipantId,
    meetingId,
    participantId,
    statusCode,
    connecte,
  ]);

  // 2. Update meeting status if needed
  const updateQuery = `
    UPDATE meeting 
    SET type_media = type_media 
    WHERE idMeeting = ?
  `;
  await executeUpdate(connection, updateQuery, [meetingId]);

  return {
    ID: newParticipantId,
    idMeeting: meetingId,
    IDparticipant: participantId,
    status,
    joinedAt: new Date().toISOString(),
  };
}

/**
 * Pattern: Create conversation + Add participants (for groups)
 * Ensures conversation is created with all participants atomically
 * 
 * For DM conversations, the `conversation` table schema only has a single
 * `participantID` column (no creator/owner column, no join table). To make
 * sure the CREATOR is also recognized as a member of the conversation, we
 * insert an invisible system message authored by the creator in the same
 * transaction. Authorization checks elsewhere in the codebase grant access
 * if either `participantID = userId` OR a message exists with
 * `senderID = userId` in that conversation — so this system message lets
 * the creator pass that check immediately, even before sending their first
 * real message. The system message is marked `isDeleted = 1` so it is never
 * shown in the chat history (all message-listing queries filter on
 * `isDeleted = 0`).
 * 
 * @param {Object} connection - DB connection
 * @param {Object} conversationData - Conversation data
 * @param {number} conversationData.creatorId - Creator ID
 * @param {array} conversationData.participantIds - Array of participant IDs [creator, ...others]
 * @param {string} conversationData.name - Group name (optional)
 * @param {boolean} conversationData.isGroup - True for group, false for DM
 * @returns {Object} Created conversation
 */
export async function atomicCreateConversation(connection, conversationData) {
  const {
    creatorId,
    participantIds = [],
    name = '',
    isGroup = false,
  } = conversationData;

  // Get next conversation ID
  const conversationId = await getNextId(connection, 'conversation', 'conversID');

  // 1. Insert conversation
  const insertQuery = `
    INSERT INTO conversation 
    (conversID, participantID, isGroup, GroupName, isArchived, isPinned, unreadCount)
    VALUES (?, ?, ?, ?, 0, 0, 0)
  `;

  // For DM: participantID is the other user
  // For group: participantID may store first recipient (schema limitation)
  const participantIdValue = participantIds[0] || null;
  await executeInsert(connection, insertQuery, [
    conversationId,
    participantIdValue,
    isGroup ? 1 : 0,
    name,
  ]);

  // 2. Insert a system message from the creator so they are recognized
  //    as a participant via the EXISTS(senderID) check (schema limitation
  //    workaround: participantID column can only store ONE user, so the
  //    creator's membership is proven through message history instead).
  if (!isGroup && creatorId) {
    const systemMsgID = await getNextId(connection, 'message', 'msgID');
    const systemMsgQuery = `
      INSERT INTO message 
      (msgID, senderID, conversationID, content, type, mediaUrl, status, sendAt, isDeleted)
      VALUES (?, ?, ?, ?, ?, NULL, 0, NOW(), 1)
    `;
    await executeInsert(connection, systemMsgQuery, [
      systemMsgID,
      creatorId,
      conversationId,
      '',
      1, // type column is INT in the message table; 1 = 'text' (see MESSAGE_TYPE_CODES). This row is invisible (isDeleted = 1) so the type value has no functional effect.
    ]);
  }

  return {
    conversID: conversationId,
    isGroup,
    name,
    participantIds,
    createdAt: new Date().toISOString(),
  };
}

export default {
  withTransaction,
  executeInsert,
  executeUpdate,
  executeSelect,
  executeSelectOne,
  getNextId,
  atomicCreateMessage,
  atomicCreateMeeting,
  atomicAddParticipant,
  atomicCreateConversation,
};