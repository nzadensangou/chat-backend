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
    const { id: statusId, replyId } = req.query;

    // Verify status exists
    const status = await StatusService.getStatus(parseInt(statusId));
    if (!status) {
      throw new Error('NOT_FOUND: Status not found');
    }

    // Verify reply exists and belongs to user
    const reply = await StatusService.getReply(parseInt(replyId));
    if (!reply) {
      throw new Error('NOT_FOUND: Reply not found');
    }

    if (reply.userId !== userId && status.alanyaID !== userId) {
      throw new Error('FORBIDDEN: Only reply author or status owner can delete');
    }

    // Remove reply
    const result = await StatusService.removeReply(parseInt(replyId));

    logger.info({ statusId, userId, replyId }, 'Reply deleted');

    // ✅ Emit Socket.IO event for real-time update
    socketManager.safeEmit('reply:deleted', {
      replyId: parseInt(replyId),
      statusId: parseInt(statusId),
      deletedBy: userId,
      deletedAt: new Date(),
    });

    return res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  DELETE: handleDelete,
});
