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

    const validData = validate.status.validateGetReactions({
      statusId: parseInt(statusId),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    // Verify status exists
    const status = await StatusService.getStatus(validData.statusId);
    if (!status) {
      throw new Error('NOT_FOUND: Status not found');
    }

    const reactions = await StatusService.getStatusReactions(
      validData.statusId,
      validData.limit,
      validData.offset
    );

    logger.info({ statusId: validData.statusId, count: reactions.length }, 'Reactions retrieved');

    return res.status(200).json(ApiResponse.success(reactions));
  } catch (error) {
    return handleError(error, res);
  }
}

async function handlePost(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: statusId } = req.query;
    const { emoji } = req.body;

    // Validate emoji is one of allowed reactions
    const validEmojis = ['👍', '❤️', '😂', '😢', '🔥'];
    if (!validEmojis.includes(emoji)) {
      throw new Error('INVALID_REACTION: Emoji must be one of: ' + validEmojis.join(' '));
    }

    // Verify status exists
    const status = await StatusService.getStatus(parseInt(statusId));
    if (!status) {
      throw new Error('NOT_FOUND: Status not found');
    }

    // Add or update reaction
    const reaction = await StatusService.addReaction(parseInt(statusId), userId, emoji);

    logger.info({ statusId, userId, emoji }, 'Reaction added');

    // ✅ Emit Socket.IO event for real-time update
    socketManager.safeEmit('reaction:added', {
      id: reaction.id,
      statusId: parseInt(statusId),
      userId: userId,
      reaction: emoji,
      createdAt: new Date(),
    });

    return res.status(201).json(ApiResponse.created(reaction));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
  POST: handlePost,
});
