import { extractUserFromRequest, handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../lib/withLogging.js';
import { UserService } from '../../../../lib/services/index.js';
import { ContactService } from '../../../../lib/services/index.js';
import { StatusService } from '../../../../lib/services/index.js';
import { enforceResourceOwnership } from '../../../../lib/middleware/authorization.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: statsUserId } = req.query;
    const userIdInt = parseInt(statsUserId);

    if (isNaN(userIdInt) || userIdInt <= 0) {
      throw new Error('VALIDATION_ERROR: Invalid user ID');
    }

    // 🔐 AUTHORIZATION CHECK: User can only view their own stats
    enforceResourceOwnership(userId, userIdInt);

    const user = await UserService.getUserById(userIdInt);

    if (!user) {
      throw new Error('User not found');
    }

    const contactCount = await ContactService.getContactCount(userIdInt);

    const statuses = await StatusService.getUserStatuses(userIdInt, 1000, 0);
    const statusCount = statuses ? statuses.length : 0;

    return res.status(200).json(
      ApiResponse.success({
        alanyaID: user.alanyaID,
        username: user.username,
        pseudo: user.pseudo,
        typeCompte: user.typeCompte,
        stats: {
          contactCount,
          statusCount,
          createdAt: user.createdAt,
        },
      })
    );
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
});

