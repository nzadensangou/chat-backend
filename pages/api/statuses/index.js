import { extractUserFromRequest, handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { StatusService } from '../../../lib/services/index.js';
import { validate } from '../../../lib/validators/index.js';
import socketManager from '../../../lib/socket-instance.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { limit = 50, offset = 0 } = req.query;

    const validData = validate.status.validateGetStories({
      userId,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    const statuses = await StatusService.getUserStatuses(
      validData.userId,
      validData.limit,
      validData.offset
    );

    return res.status(200).json(ApiResponse.success(statuses));
  } catch (error) {
    return handleError(error, res);
  }
}

async function handlePost(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { text, caption, type, backgroundColor, mediaUrl, visibility } = req.body;

    const validData = validate.status.validateCreation({
      text: text ?? caption,
      type,
      backgroundColor,
      mediaUrl,
      visibility,
    });

    const result = await StatusService.createStatus(userId, validData);

    // ✅ Emit Socket.IO event for real-time update
    socketManager.safeEmit('status:created', {
      ...result,
      createdAt: new Date(),
    });

    return res.status(201).json(ApiResponse.created(result));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
  POST: handlePost,
});
