import { extractUserFromRequest, handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../lib/withLogging.js';
import { ConversationService } from '../../../../lib/services/index.js';

async function handlePost(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: conversationId } = req.query;

    // Check if user is member
    await ConversationService.checkUserInConversation(parseInt(conversationId), userId);

    const result = await ConversationService.clearHistory(parseInt(conversationId), userId);

    return res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  POST: handlePost,
});
