// Main services export
import { BaseService } from './base.service.js';
import UserService from './user.service.js';
import MessageService from './message.service.js';
import CallService from './call.service.js';
import ContactService from './contact.service.js';
import StatusService from './status.service.js';
import ConversationService from './conversation.service.js';

export { BaseService, UserService, MessageService, CallService, ContactService, StatusService, ConversationService };

export const services = {
  User: UserService,
  Message: MessageService,
  Call: CallService,
  Contact: ContactService,
  Status: StatusService,
  Conversation: ConversationService,
};

export default services;
