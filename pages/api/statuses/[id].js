import { extractUserFromRequest, handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { StatusService } from '../../../lib/services/index.js';
import { enforceStatusAccess, enforceStatusOwnership } from '../../../lib/middleware/authorization.js';
import socketManager from '../../../lib/socket-instance.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: statusId } = req.query;

    // 🔐 AUTHORIZATION CHECK: User must be owner or contact to view status
    await enforceStatusAccess(userId, parseInt(statusId));

    const status = await StatusService.getStatus(parseInt(statusId));

    if (!status) {
      throw new Error('NOT_FOUND: Status not found');
    }

    await StatusService.viewStatus(parseInt(statusId), userId);

    return res.status(200).json(ApiResponse.success(status));
  } catch (error) {
    return handleError(error, res);
  }
}

async function handleDelete(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: statusId } = req.query;

    // 🔐 AUTHORIZATION CHECK: Only status author can delete
    await enforceStatusOwnership(userId, parseInt(statusId));

    const result = await StatusService.deleteStatus(parseInt(statusId), userId);

    // ✅ Emit Socket.IO event for real-time update
    socketManager.safeEmit('status:deleted', {
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
  GET: handleGet,
  DELETE: handleDelete,
});
