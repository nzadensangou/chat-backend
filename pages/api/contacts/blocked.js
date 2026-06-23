import { extractUserFromRequest, handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { ContactService } from '../../../lib/services/index.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { limit = 50, offset = 0 } = req.query;

    const blockedUsers = await ContactService.getBlockedUsers(
      userId,
      Math.min(parseInt(limit), 100),
      parseInt(offset)
    );

    const blockedCount = await ContactService.getBlockedCount(userId);

    return res.status(200).json(
      ApiResponse.success({
        blockedUsers,
        count: blockedCount,
      })
    );
  } catch (error) {
    return handleError(error, res);
  }
}

async function handlePost(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { blockedUserId, reason } = req.body;

    if (!blockedUserId) {
      throw new Error('VALIDATION_ERROR: blockedUserId is required');
    }

    const result = await ContactService.blockUser(
      userId,
      parseInt(blockedUserId),
      reason || null
    );

    return res.status(201).json(ApiResponse.created(result));
  } catch (error) {
    return handleError(error, res);
  }
}

async function handleDelete(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { blockedUserId } = req.body;

    if (!blockedUserId) {
      throw new Error('VALIDATION_ERROR: blockedUserId is required');
    }

    const result = await ContactService.unblockUser(userId, parseInt(blockedUserId));

    return res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
  POST: handlePost,
  DELETE: handleDelete,
});
