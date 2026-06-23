// Main validators export with organized structure
import { BaseValidator } from './base.js';
import { AuthValidator } from './auth.js';
import { UserValidator } from './user.js';
import { MessageValidator } from './message.js';
import { CallValidator } from './call.js';
import { ContactValidator } from './contact.js';
import { StatusValidator } from './status.js';
import { ConversationValidator } from './conversation.js';
import { IdValidator } from './id.js';

export { BaseValidator, AuthValidator, UserValidator, MessageValidator, CallValidator, ContactValidator, StatusValidator, ConversationValidator, IdValidator };

// Grouped export for convenience
export const validators = {
  // Base utilities
  Base: BaseValidator,

  // Domain-specific validators
  Auth: AuthValidator,
  User: UserValidator,
  Message: MessageValidator,
  Call: CallValidator,
  Contact: ContactValidator,
  Status: StatusValidator,
  Conversation: ConversationValidator,
  Id: IdValidator,
};

// Validation utility functions for common use cases
export const validate = {
  // AUTH
  registration: (payload) => AuthValidator.validateRegistration(payload),
  login: (payload) => AuthValidator.validateLogin(payload),
  passwordRecovery: (payload) => AuthValidator.validatePasswordRecovery(payload),

  // USERS
  profileUpdate: (payload) => UserValidator.validateProfileUpdate(payload),
  passwordChange: (payload) => UserValidator.validatePasswordChange(payload),
  phoneUpdate: (payload) => UserValidator.validatePhoneUpdate(payload),
  usernameUpdate: (payload) => UserValidator.validateUsernameUpdate(payload),
  userDeletion: (payload) => UserValidator.validateUserDeletion(payload),

  // MESSAGES
  message: (payload) => MessageValidator.validateCreation(payload),
  editMessage: (payload) => MessageValidator.validateEdit(payload),
  deleteMessage: (payload) => MessageValidator.validateDelete(payload),
  readReceipt: (payload) => MessageValidator.validateReadReceipt(payload),
  bulkReadReceipts: (payload) => MessageValidator.validateBulkReadReceipts(payload),
  searchMessages: (payload) => MessageValidator.validateSearch(payload),
  forwardMessages: (payload) => MessageValidator.validateForwardMessages(payload),
  filterMessages: (payload) => MessageValidator.validateFilter(payload),

  // STATUS/STORIES
  status: {
    validateCreation: (payload) => StatusValidator.validateCreation(payload),
    validateViewStatus: (payload) => StatusValidator.validateViewStatus(payload),
    validateDelete: (payload) => StatusValidator.validateDelete(payload),
    validateGetViewers: (payload) => StatusValidator.validateGetViewers(payload),
    validateGetStories: (payload) => StatusValidator.validateGetStories(payload),
    validateGetContactStories: (payload) => StatusValidator.validateGetContactStories(payload),
    validateReport: (payload) => StatusValidator.validateReport(payload),
    validateSetVisibility: (payload) => StatusValidator.validateSetVisibility(payload),
    validateBulkViewStatuses: (payload) => StatusValidator.validateBulkViewStatuses(payload),
    validateSearch: (payload) => StatusValidator.validateSearch(payload),
    validateFilter: (payload) => StatusValidator.validateFilter(payload),
  },

  // CALLS
  call: {
    validateInitiation: (payload) => CallValidator.validateInitiation(payload),
    validateAnswer: (payload) => CallValidator.validateAnswer(payload),
    validateReject: (payload) => CallValidator.validateReject(payload),
    validateEnd: (payload) => CallValidator.validateEnd(payload),
    validateHistoryFilter: (payload) => CallValidator.validateHistoryFilter(payload),
    validateAddParticipant: (payload) => CallValidator.validateAddParticipant(payload),
  },
  callInitiation: (payload) => CallValidator.validateInitiation(payload),
  answerCall: (payload) => CallValidator.validateAnswer(payload),
  callReject: (payload) => CallValidator.validateReject(payload),
  callEnd: (payload) => CallValidator.validateEnd(payload),
  addParticipant: (payload) => CallValidator.validateAddParticipant(payload),

  // CONVERSATIONS
  groupCreation: (payload) => ConversationValidator.validateGroupCreation(payload),
  updateGroupName: (payload) => ConversationValidator.validateUpdateGroupName(payload),
  updateGroupPhoto: (payload) => ConversationValidator.validateUpdateGroupPhoto(payload),
  addMember: (payload) => ConversationValidator.validateAddMember(payload),
  removeMember: (payload) => ConversationValidator.validateRemoveMember(payload),
  bulkAddMembers: (payload) => ConversationValidator.validateBulkAddMembers(payload),
  archiveConversation: (payload) => ConversationValidator.validateArchiveConversation(payload),
  muteConversation: (payload) => ConversationValidator.validateMuteConversation(payload),
  leaveGroup: (payload) => ConversationValidator.validateLeaveConversation(payload),

  // CONTACTS
  addContact: (payload) => ContactValidator.validateAddContact(payload),
  removeContact: (payload) => ContactValidator.validateRemoveContact(payload),
  blockUser: (payload) => ContactValidator.validateBlockUser(payload),
  unblockUser: (payload) => ContactValidator.validateUnblockUser(payload),
  bulkAddContacts: (payload) => ContactValidator.validateBulkAddContacts(payload),
  syncContacts: (payload) => ContactValidator.validateContactSync(payload),

  // IDS (utilities)
  sendReceiverId: (payload) => IdValidator.validateSenderReceiverId(payload),
  callerReceiverId: (payload) => IdValidator.validateCallerReceiverId(payload),
  ownerTargetId: (payload) => IdValidator.validateOwnerTargetId(payload),
};

// Error handling helper
export const handleValidationError = (error) => {
  if (error instanceof Error) {
    return {
      status: 'error',
      statusCode: 400,
      message: error.message,
      code: BaseValidator.getErrorCode(error.message),
    };
  }

  return {
    status: 'error',
    statusCode: 500,
    message: 'An unexpected error occurred',
    code: 'UNKNOWN_ERROR',
  };
};

/**
 * Wrapper function to safely execute validators with error handling
 * @param {Function} validatorFn - Validator function to execute
 * @param {object} payload - Payload to validate
 * @returns {object} { success: boolean, data?: object, error?: object }
 */
export const safeValidate = (validatorFn, payload) => {
  try {
    const data = validatorFn(payload);
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: handleValidationError(error),
    };
  }
};

// Default export
export default validators;
