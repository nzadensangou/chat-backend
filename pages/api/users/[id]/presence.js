import { extractUserFromRequest, handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../lib/withLogging.js';
import { UserService } from '../../../../lib/services/index.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    extractUserFromRequest(req);
    const { id: userId } = req.query;
    const userIdInt = parseInt(userId);

    if (isNaN(userIdInt) || userIdInt <= 0) {
      throw new Error('VALIDATION_ERROR: Invalid user ID');
    }

    const user = await UserService.getUserById(userIdInt);

    if (!user) {
      throw new Error('User not found');
    }

    return res.status(200).json(
      ApiResponse.success({
        alanyaID: user.alanyaID,
        username: user.username,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
      })
    );
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
});

