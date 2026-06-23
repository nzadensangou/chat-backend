import { extractUserFromRequest, handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { ConversationService } from '../../../lib/services/index.js';
import { validate } from '../../../lib/validators/index.js';
import { enforceConversationAccess } from '../../../lib/middleware/authorization.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: conversationId } = req.query;

    // 🔐 AUTHORIZATION CHECK: User must be participant in conversation
    await enforceConversationAccess(userId, parseInt(conversationId));

    const conversation = await ConversationService.getConversationById(parseInt(conversationId));

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const memberCount = await ConversationService.getMemberCount(parseInt(conversationId));
    const unreadCount = await ConversationService.getUnreadCount(parseInt(conversationId), userId);

    return res.status(200).json(
      ApiResponse.success({
        ...conversation,
        memberCount,
        unreadCount,
      })
    );
  } catch (error) {
    return handleError(error, res);
  }
}

async function handlePut(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: conversationId } = req.query;
    const { groupName, groupPhoto } = req.body;

    // 🔐 AUTHORIZATION CHECK: User must be participant in conversation
    await enforceConversationAccess(userId, parseInt(conversationId));

    let result;

    if (groupName) {
      const validData = validate.updateGroupName({ groupName });
      result = await ConversationService.updateGroupName(
        parseInt(conversationId),
        userId,
        validData.groupName
      );
    }

    if (groupPhoto) {
      result = await ConversationService.updateGroupPhoto(
        parseInt(conversationId),
        userId,
        groupPhoto
      );
    }

    if (!result) {
      throw new Error('VALIDATION_ERROR: No fields to update provided');
    }

    return res.status(200).json(ApiResponse.updated(result));
  } catch (error) {
    return handleError(error, res);
  }
}

async function handleDelete(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: conversationId } = req.query;

    // 🔐 AUTHORIZATION CHECK: User must be participant in conversation
    await enforceConversationAccess(userId, parseInt(conversationId));

    const result = await ConversationService.deleteConversation(parseInt(conversationId), userId);

    return res.status(200).json(ApiResponse.deleted());
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
  PUT: handlePut,
  DELETE: handleDelete,
});

