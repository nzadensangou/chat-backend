// Call validator
import { BaseValidator } from './base.js';
import { CALL_TYPE, CALL_STATUS, APP_CONSTANTS, VALIDATION_PATTERNS } from '../constants.js';

export class CallValidator extends BaseValidator {
  /**
   * Validates call type (audio or video)
   * @param {string} type - Call type to validate
   * @returns {string} Valid call type
   * @throws {Error} If type is invalid
   */
  static validateType(type) {
    if (!type || typeof type !== 'string') {
      this.throwError('Call type is required');
    }

    const validTypes = Object.values(CALL_TYPE);
    return this.validateEnum(
      type.toLowerCase(),
      validTypes,
      'Call type'
    );
  }

  /**
   * Validates meeting room identifier
   * @param {string} room - Room identifier to validate
   * @returns {string} Valid lowercase room identifier
   * @throws {Error} If room is invalid
   */
  static validateRoom(room) {
    if (!room || typeof room !== 'string' || room.trim() === '') {
      this.throwError('Meeting room identifier is required');
    }

    const trimmed = room.trim();

    if (!this.matchesPattern(trimmed, /^[a-zA-Z0-9\-_]{5,50}$/)) {
      this.throwError(
        'Room identifier must be 5-50 alphanumeric characters, hyphens, or underscores'
      );
    }

    return trimmed.toLowerCase();
  }

  /**
   * Validates call duration in seconds
   * @param {number} duration - Duration to validate
   * @returns {number} Valid duration
   * @throws {Error} If duration is invalid
   */
  static validateDuration(duration) {
    if (duration === null || duration === undefined) {
      return 0; // Default to 0 if not provided
    }

    if (typeof duration !== 'number' || duration < 0) {
      this.throwError('Call duration must be a non-negative number');
    }

    if (duration > APP_CONSTANTS.MAX_CALL_DURATION_SECONDS) {
      this.throwError(
        `Call duration cannot exceed ${APP_CONSTANTS.MAX_CALL_DURATION_SECONDS} seconds`
      );
    }

    return Math.floor(duration);
  }

  /**
   * Validates call status
   * @param {string} status - Call status to validate
   * @returns {string} Valid call status
   * @throws {Error} If status is invalid
   */
  static validateCallStatus(status) {
    if (!status || typeof status !== 'string') {
      this.throwError('Call status is required');
    }

    const validStatuses = Object.values(CALL_STATUS);
    return this.validateEnum(
      status.toLowerCase(),
      validStatuses,
      'Call status'
    );
  }

  /**
   * Validates an optional ISO 8601 datetime string
   * @param {*} value - Value to validate
   * @param {string} fieldName - Field name for error messages
   * @returns {Date|null} Parsed Date, or null if not provided
   * @throws {Error} If provided but not a valid date
   */
  static validateOptionalDateTime(value, fieldName) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) {
      this.throwError(`${fieldName} must be a valid ISO 8601 date`);
    }
    return parsed;
  }

  /**
   * Validates call initiation payload
   * @param {object} payload - Call initiation data
   * @returns {object} Validated call data
   * @throws {Error} If any field is invalid
   */
  static validateInitiation(payload) {
    const { receiverId, callType, room, scheduledStartTime, scheduledEndTime } = payload;

    this.validateRequiredFields(payload, ['receiverId', 'callType', 'room']);

    const validatedStart = this.validateOptionalDateTime(
      scheduledStartTime,
      'scheduledStartTime'
    );
    const validatedEnd = this.validateOptionalDateTime(
      scheduledEndTime,
      'scheduledEndTime'
    );

    // ✅ Même règle déjà appliquée côté Flutter dans MeetingCreateScreen
    // (endDateTime.isBefore(startDateTime)) — on la revalide ici aussi car
    // le client ne doit jamais être la seule ligne de défense.
    if (validatedStart && validatedEnd && validatedEnd <= validatedStart) {
      this.throwError('scheduledEndTime must be after scheduledStartTime');
    }

    // ✅ FIX (bug "l'heure de début/fin n'est pas respectée") — CORRIGÉ
    // sans nouvelle colonne (schéma imposé) : on ne garde PAS les deux
    // dates séparément, on les réduit tout de suite à ce que le schéma
    // sait réellement stocker :
    //   - plannedStartTime       -> ira dans meeting.start_time
    //   - plannedDurationSeconds -> ira dans meeting.duree (temporairement,
    //     jusqu'à ce qu'endCall() l'écrase avec la durée RÉELLE)
    const plannedDurationSeconds =
      validatedStart && validatedEnd
        ? Math.round((validatedEnd.getTime() - validatedStart.getTime()) / 1000)
        : 0;

    return {
      receiverId: this.validateId(receiverId, 'Receiver ID'),
      callType: this.validateType(callType),
      room: this.validateRoom(room),
      plannedStartTime: validatedStart,
      plannedDurationSeconds,
    };
  }

  /**
   * Validates call answer payload
   * @param {object} payload - Answer data
   * @returns {object} Validated answer data
   * @throws {Error} If any field is invalid
   */
  static validateAnswer(payload) {
    const { meetingId } = payload;

    this.validateRequiredFields(payload, ['meetingId']);

    return {
      meetingId: this.validateId(meetingId, 'Meeting ID'),
    };
  }

  /**
   * Validates call rejection payload
   * @param {object} payload - Rejection data
   * @returns {object} Validated rejection data
   * @throws {Error} If any field is invalid
   */
  static validateReject(payload) {
    const { meetingId, reason } = payload;

    this.validateRequiredFields(payload, ['meetingId']);

    return {
      meetingId: this.validateId(meetingId, 'Meeting ID'),
      reason: reason
        ? this.validateLength(reason, 1, 200, 'Rejection reason')
        : null,
    };
  }

  /**
   * Validates call end payload
   * @param {object} payload - End call data
   * @returns {object} Validated end data
   * @throws {Error} If any field is invalid
   */
  static validateEnd(payload) {
    const { meetingId, duration } = payload;

    this.validateRequiredFields(payload, ['meetingId']);

    return {
      meetingId: this.validateId(meetingId, 'Meeting ID'),
      duration: this.validateDuration(duration),
    };
  }

  /**
   * Validates call history filter payload
   * @param {object} payload - Filter data
   * @returns {object} Validated filter data
   * @throws {Error} If any field is invalid
   */
  static validateHistoryFilter(payload) {
    const { limit = 50, offset = 0, type = null, status = null } = payload;

    const validatedLimit = this.validateInteger(limit, 100, 'Limit');
    const validatedOffset = this.validateInteger(offset, null, 'Offset');

    return {
      limit: Math.min(validatedLimit, 100), // Max 100 per request
      offset: validatedOffset,
      type: type ? this.validateType(type) : null,
      status: status ? this.validateCallStatus(status) : null,
    };
  }

  /**
   * Validates participant addition to meeting
   * @param {object} payload - Participant data
   * @returns {object} Validated participant data
   * @throws {Error} If any field is invalid
   */
  static validateAddParticipant(payload) {
    const { meetingId, participantId } = payload;

    this.validateRequiredFields(payload, ['meetingId', 'participantId']);

    return {
      meetingId: this.validateId(meetingId, 'Meeting ID'),
      participantId: this.validateId(participantId, 'Participant ID'),
    };
  }

  /**
   * Validates participant removal from meeting
   * @param {object} payload - Removal data
   * @returns {object} Validated removal data
   * @throws {Error} If any field is invalid
   */
  static validateRemoveParticipant(payload) {
    const { meetingId, participantId } = payload;

    this.validateRequiredFields(payload, ['meetingId', 'participantId']);

    return {
      meetingId: this.validateId(meetingId, 'Meeting ID'),
      participantId: this.validateId(participantId, 'Participant ID'),
    };
  }

  /**
   * Validates participant status update
   * @param {object} payload - Status update data
   * @returns {object} Validated update data
   * @throws {Error} If any field is invalid
   */
  static validateUpdateParticipantStatus(payload) {
    const { meetingId, participantId, status, duration } = payload;

    this.validateRequiredFields(payload, ['meetingId', 'participantId', 'status']);

    const validStatuses = ['pending', 'connected', 'ended'];

    return {
      meetingId: this.validateId(meetingId, 'Meeting ID'),
      participantId: this.validateId(participantId, 'Participant ID'),
      status: this.validateEnum(status, validStatuses, 'Participant status'),
      duration: this.validateDuration(duration),
    };
  }
}

export default CallValidator;