import { extractUserFromRequest, handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../lib/withLogging.js';
import { StatusService } from '../../../../lib/services/index.js';
import { validate } from '../../../../lib/validators/index.js';
import socketManager from '../../../../lib/socket-instance.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: statusId } = req.query;
    const { limit = 50, offset = 0 } = req.query;

    const validData = validate.status.validateGetViewers({
      statusId: parseInt(statusId),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    const status = await StatusService.getStatus(validData.statusId);
    if (!status) {
      throw new Error('NOT_FOUND: Status not found');
    }

    if (status.alanyaID !== userId) {
      throw new Error('FORBIDDEN: You can only view viewers for your own status');
    }

    const viewers = await StatusService.getStatusViewers(
      validData.statusId,
      validData.limit,
      validData.offset
    );

    const viewerCount = await StatusService.getViewerCount(validData.statusId);

    return res.status(200).json(
      ApiResponse.success({
        viewers,
        viewerCount,
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
    const { id: statusId } = req.query;
    const { statusIds } = req.body;

    if (Array.isArray(statusIds) && statusIds.length > 0) {
      const validData = validate.status.validateBulkViewStatuses({
        statusIds,
      });

      const result = await StatusService.bulkViewStatuses(validData.statusIds, userId);

      // ✅ Emit Socket.IO events for bulk view
      validData.statusIds.forEach((sId) => {
        socketManager.safeEmit('status:viewed', {
          statusId: sId,
          viewerId: userId,
          viewedAt: new Date(),
        });
      });

      return res.status(200).json(ApiResponse.success(result));
    } else {
      const result = await StatusService.viewStatus(parseInt(statusId), userId);

      // ✅ Emit Socket.IO event for single view
      socketManager.safeEmit('status:viewed', {
        statusId: parseInt(statusId),
        viewerId: userId,
        viewedAt: new Date(),
      });

      return res.status(200).json(ApiResponse.success(result));
    }
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
  POST: handlePost,
});
