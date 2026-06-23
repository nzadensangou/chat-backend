import { extractUserFromRequest, handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { MessageService } from '../../../lib/services/index.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    extractUserFromRequest(req);
    const { conversationId, q, limit = 50, offset = 0 } = req.query;

    if (!conversationId || !q) {
      throw new Error('VALIDATION_ERROR: conversationId and search query (q) are required');
    }

    const results = await MessageService.searchMessages(
      parseInt(conversationId),
      q,
      Math.min(parseInt(limit), 100),
      parseInt(offset)
    );

    return res.status(200).json(ApiResponse.success(results));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
});

