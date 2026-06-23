import { extractUserFromRequest, handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../lib/withLogging.js';
import { MessageService } from '../../../../lib/services/index.js';
import { validate } from '../../../../lib/validators/index.js';

async function handlePost(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: messageId } = req.query;
    const { targetConversationId, messageIds } = req.body;

    const messagesToForward = messageIds || [parseInt(messageId)];

    if (!targetConversationId) {
      throw new Error('VALIDATION_ERROR: targetConversationId is required');
    }

    const result = await MessageService.forwardMessages(
      messagesToForward,
      userId,
      parseInt(targetConversationId)
    );

    return res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  POST: handlePost,
});

