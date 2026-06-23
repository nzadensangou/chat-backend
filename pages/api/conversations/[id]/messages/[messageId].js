import { extractUserFromRequest, handleError } from '../../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../../lib/withLogging.js';
import { MessageService } from '../../../../../lib/services/index.js';
import { enforceMessageOwnership } from '../../../../../lib/middleware/authorization.js';

async function handlePut(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { messageId } = req.query;

    // 🔐 AUTHORIZATION CHECK: Only message author can edit
    await enforceMessageOwnership(userId, messageId);

    const result = await MessageService.editMessage(
      parseInt(messageId),
      userId,
      req.body
    );

    return res.status(200).json(ApiResponse.updated(result));
  } catch (error) {
    return handleError(error, res);
  }
}

async function handleDelete(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { messageId } = req.query;

    // 🔐 AUTHORIZATION CHECK: Only message author can delete
    await enforceMessageOwnership(userId, messageId);

    const result = await MessageService.deleteMessage(
      parseInt(messageId),
      userId
    );

    return res.status(200).json(ApiResponse.deleted());
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  PUT: handlePut,
  DELETE: handleDelete,
});

