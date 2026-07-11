// ============================================================================
// MESSAGE ENUMS  
// ============================================================================
export const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  FILE: 'file',
  LOCATION: 'location',
  CONTACT: 'contact',
  STICKER: 'sticker',
};

export const MESSAGE_TYPE_CODES = {
  text: 1,
  image: 2,
  video: 3,
  audio: 4,
  file: 5,
  location: 6,
  contact: 7,
  sticker: 8,
};

// Reverse of MESSAGE_TYPE_CODES : le type stocké en base est un entier
// (messages.type est INT), mais tout ce qui part vers le frontend
// (Socket.IO 'message:new', réponse REST, notif FCM) doit renvoyer le
// libellé texte ('audio', 'image'...), pas le code numérique brut.
export const MESSAGE_TYPE_LABELS = {
  1: 'text',
  2: 'image',
  3: 'video',
  4: 'audio',
  5: 'file',
  6: 'location',
  7: 'contact',
  8: 'sticker',
};

export const MESSAGE_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
};

// ============================================================================
// CALL ENUMS
// ============================================================================

export const CALL_TYPE = {
  AUDIO: 'audio',
  VIDEO: 'video',
};

// Map CALL_TYPE to database integer values (type_media column is INT in meeting table)
export const CALL_TYPE_CODES = {
  audio: 1,
  video: 2,
};

// Map participant status to database integer values (status column is INT in participant table)
export const PARTICIPANT_STATUS_CODES = {
  initiated: 0,
  ringing: 1,
  connected: 2,
  ended: 3,
  rejected: 4,
  missed: 5,
};

// ✅ Ajouté suite à la vérification de la vraie base de données :
// callHistory.status est un smallint (PAS un varchar comme le code le
// supposait) — il faut donc des codes numériques, pas des chaînes.
export const CALL_HISTORY_STATUS_CODES = {
  completed: 1,
  missed: 2,
  rejected: 3,
};

export const CALL_HISTORY_STATUS_LABELS = {
  1: 'completed',
  2: 'missed',
  3: 'rejected',
};

// callHistory.type est lui aussi un smallint : on réutilise CALL_TYPE_CODES
// (déjà défini plus haut, 1=audio/2=video) pour rester cohérent avec la
// table meeting.type_media qui utilise la même convention.
export const CALL_HISTORY_TYPE_LABELS = {
  1: 'audio',
  2: 'video',
};

export const CALL_STATUS = {
  INITIATED: 'initiated',
  RINGING: 'ringing',
  ACCEPTED: 'accepted',
  IN_PROGRESS: 'inProgress',
  ENDED: 'ended',
  REJECTED: 'rejected',
  MISSED: 'missed',
  FAILED: 'failed',
};

// ============================================================================
// STATUS & ACCOUNT ENUMS
// ============================================================================

export const STATUS_TYPE = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
};

// Map STATUS_TYPE to database integer values (type column is INT in statut table)
export const STATUS_TYPE_CODES = {
  text: 1,
  image: 2,
  video: 3,
};

export const ACCOUNT_TYPE = {
  PERSONAL: 'personal',
  BUSINESS: 'business',
};

// ============================================================================
// APPLICATION CONSTANTS
// ============================================================================

export const APP_CONSTANTS = {
  JWT_EXPIRATION_DAYS: 7,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 64,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  PHONE_NUMBER_MIN_LENGTH: 6,
  PHONE_NUMBER_MAX_LENGTH: 15,
  EMAIL_MAX_LENGTH: 254,
  NAME_MAX_LENGTH: 100,
  PSEUDO_MAX_LENGTH: 50,
  MAX_MESSAGE_LENGTH: 4096,
  MAX_STATUS_LENGTH: 280,
  MAX_GROUP_NAME: 100,
  STATUS_EXPIRATION_HOURS: 24,
};

// ============================================================================
// VALIDATION PATTERNS
// ============================================================================

export const VALIDATION_PATTERNS = {
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  PHONE: /^\+?[1-9]\d{1,14}$/, // E.164 format
  USERNAME: /^[a-zA-Z0-9_-]{3,30}$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/,
  NAME: /^[A-Za-z\s-]+$/,
  URL: /^https?:\/\/.+/,
  HEX_COLOR: /^#(?:[0-9a-fA-F]{3}){1,2}$/,
  IP_ADDRESS: /^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/,
};

// NOTE: API_MESSAGES has been moved to lib/utils/error-codes.js
// API-related error messages are now centralized in error-codes.js
// Import from there instead: import { API_RESPONSE_MESSAGES } from '../utils/error-codes'