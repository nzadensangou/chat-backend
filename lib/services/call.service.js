// Call service - Handle call initiation, management, permissions
import db from '../db/index.js';
import { validate, safeValidate } from '../validators/index.js';
import { API_MESSAGES } from '../utils/error-codes.js';
import { CALL_TYPE_CODES, PARTICIPANT_STATUS_CODES } from '../constants.js';
import { withTransaction, atomicCreateMeeting, atomicAddParticipant, getNextId } from '../db/transaction-helper.js';

export class CallService {
  static async initiateCall(callerId, payload) {
    const validData = validate.callInitiation(payload);
    const { receiverId, callType, room } = validData;

    if (callerId === receiverId) {
      throw new Error('Cannot call yourself');
    }

    const isInContacts = await this.isUserInContacts(callerId, receiverId);
    if (!isInContacts) {
      throw new Error(API_MESSAGES.CALL_NOT_ALLOWED);
    }

    const isBlocked = await this.isUserBlocked(callerId, receiverId);
    if (isBlocked) {
      throw new Error(API_MESSAGES.USER_BLOCKED);
    }

    const result = await this.createMeeting({
      idOrganiser: callerId,
      callType,
      room,
      objet: `${callType} call`,
    });

    // Log the call as initiated (best-effort; doesn't block the response)
    this.logCall(callerId, receiverId, callType, 'initiated', 0).catch(() => {});

    return result;
  }

  /**
   * Create a meeting (ATOMIC - meeting + organizer participant in one transaction)
   * Ensures meeting is created with organizer as first participant atomically
   * @throws {Error} If creation fails - entire transaction is rolled back
   */
  static async createMeeting(payload) {
    const { idOrganiser, callType, room, objet } = payload;

    // Execute as atomic transaction: CREATE meeting + ADD organizer as participant
    return await withTransaction(async (connection) => {
      return await atomicCreateMeeting(connection, {
        organizerId: idOrganiser,
        callType: callType,
        room: room,
        description: objet,
      });
    });
  }

  /**
   * Answer a call (ATOMIC - add participant + update meeting in one transaction)
   * Ensures receiver is added as participant atomically
   * @throws {Error} If operation fails - entire transaction is rolled back
   */
  static async answerCall(meetingId, receiverId, payload) {
    const meeting = await this.getMeetingDetails(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    // Execute as atomic transaction: ADD participant + UPDATE meeting
    await withTransaction(async (connection) => {
      await atomicAddParticipant(connection, meetingId, receiverId, 'connected');
    });

    // Log the call as answered (best-effort; doesn't block the response)
    this.logCall(meeting.idOrganiser, receiverId, meeting.type_media, 'answered', 0).catch(() => {});

    return {
      idMeeting: meetingId,
      status: 'in_progress',
      message: 'Call answered',
    };
  }

  static async rejectCall(meetingId, receiverId, payload) {
    const { reason } = payload;

    const meeting = await this.getMeetingDetails(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    // ✅ Generate participant ID and insert atomically (was: separate
    // SELECT MAX()+1 followed by a non-transactional INSERT, which could
    // race with a concurrent request and collide on the primary key).
    await withTransaction(async (connection) => {
      const participantId = await getNextId(connection, 'participant', 'ID');

      const query = `
        INSERT INTO participant (ID, idMeeting, IDparticipant, status, start_time, connecte, duree)
        VALUES (?, ?, ?, ?, NOW(), 0, 0)
      `;
      await connection.query(query, [
        participantId,
        meetingId,
        receiverId,
        PARTICIPANT_STATUS_CODES.rejected,
      ]);

      // ✅ Mark the meeting as ended so it stops showing up as an
      // "incoming call" (meeting.isEnd was never updated before).
      await connection.query('UPDATE meeting SET isEnd = 1 WHERE idMeeting = ?', [meetingId]);
    });

    // Log the call as rejected (best-effort; doesn't block the response)
    this.logCall(meeting.idOrganiser, receiverId, meeting.type_media, 'rejected', 0).catch(() => {});

    return {
      idMeeting: meetingId,
      status: 'rejected',
      reason,
      message: 'Call rejected',
    };
  }

  static async endCall(meetingId, payload) {
    const { duration } = payload;

    const meeting = await this.getMeetingDetails(meetingId);

    // ✅ isEnd=1 added (was missing entirely - meeting stayed visible as
    // an "incoming"/"active" call forever in incoming.js / active.js queries).
    const query = `UPDATE meeting SET duree = ?, isEnd = 1 WHERE idMeeting = ?`;
    await db.query(query, [duration, meetingId]);

    const participantQuery = `
      UPDATE participant SET status = ?, duree = ? WHERE idMeeting = ?
    `;
    await db.query(participantQuery, [PARTICIPANT_STATUS_CODES.ended, duration, meetingId]);

    // Log the call as ended (best-effort; doesn't block the response)
    if (meeting) {
      const participants = await this.getMeetingParticipants(meetingId);
      const receiver = participants.find((p) => p.IDparticipant !== meeting.idOrganiser);
      if (receiver) {
        this.logCall(meeting.idOrganiser, receiver.IDparticipant, meeting.type_media, 'ended', duration).catch(() => {});
      }
    }

    return {
      idMeeting: meetingId,
      status: 'ended',
      duration,
      message: 'Call ended',
    };
  }

  static async addParticipant(meetingId, participantId, payload) {
    const isParticipant = await this.isParticipantInMeeting(meetingId, participantId);
    if (isParticipant) {
      throw new Error('User is already a participant');
    }

    // ✅ status is a tinyint column - was inserting the string 'pending'
    // which isn't even a defined status code (PARTICIPANT_STATUS_CODES has
    // no 'pending' entry). Use 'initiated' (0), the correct starting state.
    const query = `
      INSERT INTO participant (idMeeting, IDparticipant, status, connecte, duree)
      VALUES (?, ?, ?, 0, 0)
    `;

    await db.query(query, [meetingId, participantId, PARTICIPANT_STATUS_CODES.initiated]);

    return {
      idMeeting: meetingId,
      participantId,
      message: 'Participant added',
    };
  }

  static async removeParticipant(meetingId, participantId) {
    const query = `DELETE FROM participant WHERE idMeeting = ? AND IDparticipant = ?`;
    await db.query(query, [meetingId, participantId]);

    return {
      idMeeting: meetingId,
      participantId,
      message: 'Participant removed',
    };
  }

  static async updateParticipantStatus(meetingId, participantId, payload) {
    const { status, duration } = payload;

    const query = `
      UPDATE participant SET status = ?, duree = ? WHERE idMeeting = ? AND IDparticipant = ?
    `;

    await db.query(query, [status, duration, meetingId, participantId]);

    return {
      idMeeting: meetingId,
      participantId,
      status,
      duration,
      message: 'Participant status updated',
    };
  }

  static async getMeetingParticipants(meetingId) {
    const query = `
      SELECT p.ID, p.IDparticipant, p.status, p.connecte, p.duree,
             u.nom, u.pseudo, u.avatar_url
      FROM participant p
      INNER JOIN users u ON p.IDparticipant = u.alanyaID
      WHERE p.idMeeting = ?
    `;

    return await db.getAll(query, [meetingId]);
  }

  static async getCallHistory(userId, limit = 50, offset = 0) {
    const query = `
      SELECT ch.*, u_caller.pseudo as callerName, u_receiver.pseudo as receiverName
      FROM callHistory ch
      LEFT JOIN users u_caller ON ch.idCaller = u_caller.alanyaID
      LEFT JOIN users u_receiver ON ch.idReceiver = u_receiver.alanyaID
      WHERE ch.idCaller = ? OR ch.idReceiver = ?
      ORDER BY ch.created_at DESC
      LIMIT ? OFFSET ?
    `;

    return await db.getAll(query, [userId, userId, limit, offset]);
  }

  static async getCallHistoryByType(userId, callType, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM callHistory
      WHERE (idCaller = ? OR idReceiver = ?) AND type = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    return await db.getAll(query, [userId, userId, callType, limit, offset]);
  }

  static async canCallUser(callerId, receiverId) {
    try {
      const isInContacts = await this.isUserInContacts(callerId, receiverId);
      if (!isInContacts) {
        return false;
      }

      const isBlocked = await this.isUserBlocked(callerId, receiverId);
      if (isBlocked) {
        return false;
      }

      return true;
    } catch (err) {
      return false;
    }
  }

  static async isUserBlocked(callerId, receiverId) {
    const query = `
      SELECT COUNT(*) as count FROM blocked
      WHERE alanyaID = ? AND idCallerBlock = ?
    `;

    const row = await db.getOne(query, [receiverId, callerId]);
    return (row?.count || 0) > 0;
  }

  static async isUserInContacts(userId, contactId) {
    const query = `
      SELECT COUNT(*) as count FROM preferredContact
      WHERE alanyaID = ? AND idFriend = ?
    `;

    const row = await db.getOne(query, [userId, contactId]);
    return (row?.count || 0) > 0;
  }

  static async getMeetingDetails(meetingId) {
    const query = `SELECT * FROM meeting WHERE idMeeting = ? LIMIT 1`;
    return await db.getOne(query, [meetingId]);
  }

  static async isParticipantInMeeting(meetingId, participantId) {
    const query = `
      SELECT COUNT(*) as count FROM participant
      WHERE idMeeting = ? AND IDparticipant = ?
    `;

    const row = await db.getOne(query, [meetingId, participantId]);
    return (row?.count || 0) > 0;
  }

  static async logCall(callerId, receiverId, callType, status, duration = 0) {
    // ✅ Was inserting into "callhistory" (lowercase) while the real table
    // is "callHistory" - on a case-sensitive MySQL setup this would have
    // failed with "table doesn't exist" the moment this method was called.
    const query = `
      INSERT INTO callHistory (idCaller, idReceiver, type, status, start_time, duree)
      VALUES (?, ?, ?, ?, NOW(), ?)
    `;

    await db.query(query, [callerId, receiverId, callType, status, duration]);

    return { message: 'Call logged' };
  }
}

export default CallService;