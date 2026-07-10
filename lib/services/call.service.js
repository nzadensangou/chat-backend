// Call service - Handle call initiation, management, permissions
import db from '../db/index.js';
import { validate, safeValidate } from '../validators/index.js';
import { API_MESSAGES } from '../utils/error-codes.js';
import { CALL_TYPE_CODES, PARTICIPANT_STATUS_CODES, CALL_HISTORY_STATUS_CODES, CALL_HISTORY_STATUS_LABELS, CALL_HISTORY_TYPE_LABELS } from '../constants.js';
import { withTransaction, atomicCreateMeeting, atomicAddParticipant, getNextId } from '../db/transaction-helper.js';
import { SelfCallError, CallNotAllowedError, UserBlockedError } from '../errors/index.js';
// ✅ Import direct des fichiers (pas via services/index.js, qui importe déjà
// call.service.js — un import circulaire planterait au chargement du module).
import { UserService } from './user.service.js';
import fcmService from './fcm.service.js';

export class CallService {
  static async initiateCall(callerId, payload) {
    // ✅ FIX ("Required field room is missing") : `room` est un identifiant
    // technique WebRTC (nom de room côté signaling), pas une information
    // que le client doit connaître/fournir à l'avance pour un appel 1-à-1
    // classique (ChatScreen -> bouton appel). Seul le flux "réunion
    // planifiée" (MeetingCreateScreen) en fournit une lui-même. On en
    // génère une par défaut ICI, avant validation, si elle est absente —
    // ainsi le validateur reçoit toujours une valeur, quelle que soit son
    // exigence exacte sur ce champ.
    //
    // On mappe aussi `calleeId` -> `receiverId` : le client Flutter
    // (CallSocketService.initiateCall) envoie `calleeId`, alors que ce
    // service et son validateur attendent `receiverId`. Sans ce mapping,
    // `receiverId` resterait `undefined` même après avoir corrigé `room`.
    const receiverIdForRoom = payload.receiverId ?? payload.calleeId;
    const normalizedPayload = {
      ...payload,
      receiverId: receiverIdForRoom,
      room:
        payload.room ||
        `call-${callerId}-${receiverIdForRoom}-${Date.now()}`,
    };

    const validData = validate.callInitiation(normalizedPayload);
    const { receiverId, callType, room, title, plannedStartTime } = validData;

    if (callerId === receiverId) {
      throw new SelfCallError();
    }

    const isInContacts = await this.isUserInContacts(callerId, receiverId);
    if (!isInContacts) {
      throw new CallNotAllowedError(API_MESSAGES.CALL_NOT_ALLOWED);
    }

    const isBlocked = await this.isUserBlocked(callerId, receiverId);
    if (isBlocked) {
      throw new UserBlockedError();
    }

    // ✅ FIX (bug "titre toujours 'video call'") : `objet` reprend
    // maintenant le titre saisi par l'utilisateur (MeetingCreateScreen)
    // quand il est fourni, et ne retombe sur le libellé générique
    // ("audio/video call") que pour les appels 1-à-1 sans titre.
    const result = await this.createMeeting({
      idOrganiser: callerId,
      receiverId,
      callType,
      room,
      objet: title || `${callType} call`,
      plannedStartTime,
    });

    // ✅ FIX (bug "les participants ne sont pas notifiés") : le service FCM
    // (fcm.service.js) était déjà entièrement écrit — sendCallNotification()
    // construit un message Android + iOS complet (titre, corps, son,
    // payload data) — mais RIEN ne l'appelait jamais depuis le flux
    // d'appel/réunion. Ce n'était pas un bug de logique, juste un
    // branchement jamais fait.
    //
    // Volontairement PAS de `await` ici : une notification qui échoue ou
    // qui met du temps à partir (réseau FCM) ne doit jamais retarder ni
    // faire échouer la création de la réunion elle-même pour l'appelant.
    // `.catch()` capture toute erreur pour éviter une "unhandled promise
    // rejection" côté Node — cette voie d'échec est déjà gérée à
    // l'intérieur de sendCallNotification() (qui ne lève jamais, voir
    // fcm.service.js), donc ce .catch() est surtout une sécurité
    // supplémentaire pour _notifyReceiverOfIncomingCall() elle-même
    // (ex: si la requête SQL de lookup utilisateur échoue).
    this._notifyReceiverOfIncomingCall(receiverId, callerId, callType).catch(
      (err) => {
        console.error('⚠️ Failed to send call notification:', err.message);
      }
    );

    // ✅ Plus de logCall('initiated', ...) ici : cette ligne d'historique
    // "provisoire" était systématiquement dupliquée avec celle de
    // answerCall()/endCall() pour le MÊME appel. Une seule ligne finale
    // est maintenant écrite dans endCall(), une fois le résultat réel de
    // l'appel connu (completed / missed).

    return result;
  }

  /**
   * Envoie une notification push au destinataire d'un appel/réunion entrant.
   * Ne lève JAMAIS d'exception vers l'appelant de initiateCall() : une
   * notification manquée ne doit pas empêcher la réunion d'exister.
   * @private
   */
  static async _notifyReceiverOfIncomingCall(receiverId, callerId, callType) {
    if (!fcmService.isReady()) {
      console.warn('⚠️ FCM not initialized — skipping call notification');
      return;
    }

    const [receiver, caller] = await Promise.all([
      UserService.getUserById(receiverId),
      UserService.getUserById(callerId),
    ]);

    if (!receiver?.fcm_token) {
      console.warn(
        `⚠️ No FCM token for receiver ${receiverId} — cannot notify of incoming call`
      );
      return;
    }

    await fcmService.sendCallNotification(receiver.fcm_token, {
      callerId,
      callerName: caller?.pseudo || caller?.nom || 'Someone',
      callType,
    });
  }

  /**
   * Create a meeting (ATOMIC - meeting + organizer participant in one transaction)
   * Ensures meeting is created with organizer as first participant atomically
   * @throws {Error} If creation fails - entire transaction is rolled back
   */
  static async createMeeting(payload) {
    const { idOrganiser, receiverId, callType, room, objet, plannedStartTime } = payload;

    // Execute as atomic transaction: CREATE meeting + ADD organizer as participant
    return await withTransaction(async (connection) => {
      return await atomicCreateMeeting(connection, {
        organizerId: idOrganiser,
        receiverId,
        callType: callType,
        room: room,
        description: objet,
        plannedStartTime,
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

    // ✅ Plus de logCall('answered', ...) ici, même raison que dans
    // initiateCall() : une seule ligne d'historique, écrite dans endCall().

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

    // ✅ Le destinataire a déjà une ligne 'participant' en statut "ringing"
    // (créée dès initiateCall()). On la MET À JOUR vers "rejected" au lieu
    // d'en insérer une deuxième — l'ancien code faisait un INSERT ici,
    // laissant une ligne "ringing" fantôme en plus de la ligne "rejected".
    await withTransaction(async (connection) => {
      const [existingRows] = await connection.query(
        'SELECT ID FROM participant WHERE idMeeting = ? AND IDparticipant = ? LIMIT 1',
        [meetingId, receiverId]
      );

      if (existingRows.length > 0) {
        await connection.query(
          'UPDATE participant SET status = ? WHERE idMeeting = ? AND IDparticipant = ?',
          [PARTICIPANT_STATUS_CODES.rejected, meetingId, receiverId]
        );
      } else {
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
      }

      // ✅ Mark the meeting as ended so it stops showing up as an
      // "incoming call" (meeting.isEnd was never updated before).
      await connection.query('UPDATE meeting SET isEnd = 1 WHERE idMeeting = ?', [meetingId]);
    });

    // Log the call as rejected (best-effort; doesn't block the response)
    this.logCall(
      meeting.idOrganiser,
      receiverId,
      this._typeMediaToString(meeting.type_media),
      'rejected',
      0
    ).catch(() => {});

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

    // ✅ FIX historique des appels : on n'écrase plus le statut de TOUS
    // les participants avec 'ended' — ça effaçait la trace de qui avait
    // réellement décroché. On ne fait avancer que ceux qui étaient encore
    // "ringing" (jamais décroché) vers "missed" ; ceux déjà "connected"
    // passent à "ended" normalement.
    await db.query(
      `UPDATE participant SET status = ?, duree = ? WHERE idMeeting = ? AND status = ?`,
      [PARTICIPANT_STATUS_CODES.ended, duration, meetingId, PARTICIPANT_STATUS_CODES.connected]
    );
    await db.query(
      `UPDATE participant SET status = ? WHERE idMeeting = ? AND status = ?`,
      [PARTICIPANT_STATUS_CODES.missed, meetingId, PARTICIPANT_STATUS_CODES.ringing]
    );

    // ✅ Une seule ligne d'historique par appel, écrite ici (fin de
    // l'appel), avec le VRAI statut final :
    //  - 'missed' si le destinataire n'a jamais rejoint (toujours "ringing"
    //    juste avant qu'on le passe à "missed" ci-dessus)
    //  - 'completed' s'il a bien répondu (answerCall() l'avait passé à
    //    "connected")
    // Avant ce fix : logCall() était appelé 3 fois par appel (initiate,
    // answer, end), créant des doublons, et JAMAIS avec le statut 'missed'
    // (un appel non décroché ne remontait dans aucune requête, faute de
    // ligne participant pour le destinataire).
    if (meeting) {
      const participants = await this.getMeetingParticipants(meetingId);
      const receiver = participants.find((p) => p.IDparticipant !== meeting.idOrganiser);
      if (receiver) {
        const wasAnswered =
          receiver.status === PARTICIPANT_STATUS_CODES.ended ||
          receiver.status === PARTICIPANT_STATUS_CODES.connected;
        const finalStatus = wasAnswered ? 'completed' : 'missed';
        this.logCall(
          meeting.idOrganiser,
          receiver.IDparticipant,
          this._typeMediaToString(meeting.type_media),
          finalStatus,
          duration
        ).catch(() => {});
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

    // ✅ Même fix que dans initiateCall() : un participant ajouté après la
    // création de la réunion doit lui aussi être notifié. On récupère
    // l'organisateur pour l'afficher comme "invitant" dans la notification.
    const meeting = await this.getMeetingDetails(meetingId);
    if (meeting) {
      this._notifyReceiverOfIncomingCall(
        participantId,
        meeting.idOrganiser,
        this._typeMediaToString(meeting.type_media)
      ).catch((err) => {
        console.error('⚠️ Failed to send call notification:', err.message);
      });
    }

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

    const rows = await db.getAll(query, [userId, userId, limit, offset]);
    // ✅ La BDD stocke type/status en smallint ; le frontend Flutter attend
    // des chaînes ('audio'/'video', 'completed'/'missed'/'rejected').
    return rows.map((row) => this._formatCallHistoryRow(row));
  }

  static async getCallHistoryByType(userId, callType, limit = 50, offset = 0) {
    // callType arrive en string ('audio'/'video') depuis la query string de
    // l'API ; la colonne est un smallint, il faut donc la convertir avant
    // de filtrer, sinon `type = 'audio'` ne matche jamais rien.
    const typeCode = CALL_TYPE_CODES[callType] ?? CALL_TYPE_CODES.audio;

    const query = `
      SELECT * FROM callHistory
      WHERE (idCaller = ? OR idReceiver = ?) AND type = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = await db.getAll(query, [userId, userId, typeCode, limit, offset]);
    return rows.map((row) => this._formatCallHistoryRow(row));
  }

  // Reconvertit une ligne brute de callHistory (type/status en smallint)
  // en objet avec des chaînes lisibles, format attendu par le frontend.
  static _formatCallHistoryRow(row) {
    return {
      ...row,
      type: CALL_HISTORY_TYPE_LABELS[row.type] || 'audio',
      status: CALL_HISTORY_STATUS_LABELS[row.status] || 'completed',
    };
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

  // ✅ meeting.type_media est stocké en INT (1=audio, 2=video) alors que
  // callHistory.type attend une chaîne ('audio'/'video', comme lue par le
  // frontend). Sans cette conversion, callHistory.type recevait littéralement
  // 1 ou 2, affiché tel quel côté app au lieu de "Audio"/"Vidéo".
  static _typeMediaToString(typeMedia) {
    return typeMedia === 2 || typeMedia === '2' ? 'video' : 'audio';
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
    
    // ✅ FIX (confirmé via DESCRIBE sur la vraie base) :
    //  1. callHistory.type et .status sont des SMALLINT, pas des VARCHAR.
    //     Insérer les chaînes 'completed'/'audio' etc. directement faisait
    //     que MySQL les convertissait silencieusement en 0 (une chaîne non
    //     numérique convertie en nombre = 0) : le statut réel était donc
    //     TOUJOURS perdu. On convertit maintenant en code numérique.
    //  2. callHistory.created_at est NOT NULL SANS valeur par défaut : ne
    //     jamais le fournir dans l'INSERT causait un échec SQL immédiat,
    //     silencieusement avalé par le .catch(() => {}) des appelants —
    //     c'est la cause probable pour laquelle callHistory est restée
    //     vide depuis le début.
    const typeCode = CALL_TYPE_CODES[callType] ?? CALL_TYPE_CODES.audio;
    const statusCode =
      CALL_HISTORY_STATUS_CODES[status] ?? CALL_HISTORY_STATUS_CODES.completed;

    const query = `
      INSERT INTO callHistory (idCaller, idReceiver, type, status, created_at, start_time, duree)
      VALUES (?, ?, ?, ?, NOW(), NOW(), ?)
    `;

    await db.query(query, [callerId, receiverId, typeCode, statusCode, duration]);

    return { message: 'Call logged' };
  }
}

export default CallService;