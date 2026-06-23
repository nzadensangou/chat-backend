import { extractUserFromRequest, handleError } from '../../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../../lib/withLogging.js';
import { StatusService } from '../../../../../lib/services/index.js';
import { validate } from '../../../../../lib/validators/index.js';
import socketManager from '../../../../../lib/socket-instance.js';
import { logger } from '../../../../../lib/logger.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: statusId } = req.query;
    const { limit = 50, offset = 0 } = req.query;

    const validData = validate.status.validateGetReplies({
      statusId: parseInt(statusId),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    // Verify status exists
    const status = await StatusService.getStatus(validData.statusId);
    if (!status) {
      throw new Error('NOT_FOUND: Status not found');
    }

    const replies = await StatusService.getStatusReplies(
      validData.statusId,
      validData.limit,
      validData.offset
    );

    logger.info({ statusId: validData.statusId, count: replies.length }, 'Replies retrieved');

    return res.status(200).json(ApiResponse.success(replies));
  } catch (error) {
    return handleError(error, res);
  }
}

async function handlePost(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: statusId } = req.query;
    const { message, mediaUrl } = req.body;

    const validData = validate.status.validateCreatingReply({
      message,
      mediaUrl,
    });

    // Verify status exists
    const status = await StatusService.getStatus(parseInt(statusId));
    if (!status) {
      throw new Error('NOT_FOUND: Status not found');
    }

    // Add reply
    const reply = await StatusService.addReply(parseInt(statusId), userId, validData);

    logger.info({ statusId, userId, replyId: reply.id }, 'Reply added');

    // ✅ Emit Socket.IO event for real-time update
    socketManager.safeEmit('reply:added', {
      id: reply.id,
      statusId: parseInt(statusId),
      userId: userId,
      message: validData.message,
      mediaUrl: validData.mediaUrl,
      createdAt: new Date(),
    });

    return res.status(201).json(ApiResponse.created(reply));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
  POST: handlePost,
});
