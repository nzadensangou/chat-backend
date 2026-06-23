import { extractUserFromRequest, handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../lib/withLogging.js';
import { MessageService } from '../../../../lib/services/index.js';
import { enforceConversationAccess } from '../../../../lib/middleware/authorization.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: conversationId } = req.query;
    const { limit = 50, offset = 0 } = req.query;

    // 🔐 AUTHORIZATION CHECK: User must participate in conversation to see messages
    await enforceConversationAccess(userId, conversationId);

    const messages = await MessageService.getMessages(
      parseInt(conversationId),
      Math.min(parseInt(limit), 100),
      parseInt(offset)
    );

    return res.status(200).json(ApiResponse.success(messages));
  } catch (error) {
    return handleError(error, res);
  }
}

async function handlePost(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: conversationId } = req.query;

    console.log('DEBUG userId:', userId, typeof userId);
    console.log('DEBUG conversationId:', conversationId, typeof conversationId);

    // 🔐 AUTHORIZATION CHECK: User must participate in conversation to send messages
    await enforceConversationAccess(userId, conversationId);

    const result = await MessageService.createMessage(
      userId,
      parseInt(conversationId),
      req.body
    );

    return res.status(201).json(ApiResponse.created(result));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
  POST: handlePost,
});

