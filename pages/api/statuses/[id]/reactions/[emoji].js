import { extractUserFromRequest, handleError } from '../../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../../lib/withLogging.js';
import { StatusService } from '../../../../../lib/services/index.js';
import socketManager from '../../../../../lib/socket-instance.js';
import { logger } from '../../../../../lib/logger.js';

async function handleDelete(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: statusId, emoji } = req.query;

    // Verify status exists
    const status = await StatusService.getStatus(parseInt(statusId));
    if (!status) {
      throw new Error('NOT_FOUND: Status not found');
    }

    // Remove reaction
    const result = await StatusService.removeReaction(parseInt(statusId), userId, emoji);

    logger.info({ statusId, userId, emoji }, 'Reaction removed');

    // ✅ Emit Socket.IO event for real-time update
    socketManager.safeEmit('reaction:removed', {
      statusId: parseInt(statusId),
      userId: userId,
      emoji: emoji,
      removedAt: new Date(),
    });

    return res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  DELETE: handleDelete,
});
