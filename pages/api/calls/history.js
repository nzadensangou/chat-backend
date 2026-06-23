import { extractUserFromRequest, handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { CallService } from '../../../lib/services/index.js';
import { validate } from '../../../lib/validators/index.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { limit = 50, offset = 0, type = null, status = null } = req.query;

    // Validate pagination
    const queryLimit = parseInt(limit);
    const queryOffset = parseInt(offset);

    if (isNaN(queryLimit) || queryLimit <= 0 || queryLimit > 100) {
      throw new Error('VALIDATION_ERROR: Invalid limit - must be between 1 and 100');
    }

    if (isNaN(queryOffset) || queryOffset < 0) {
      throw new Error('VALIDATION_ERROR: Invalid offset - must be >= 0');
    }

    // Validate input
    const validData = validate.call.validateHistoryFilter({
      limit: queryLimit,
      offset: queryOffset,
      type,
      status,
    });

    // Get history
    let history;
    if (validData.type) {
      history = await CallService.getCallHistoryByType(
        userId,
        validData.type,
        validData.limit,
        validData.offset
      );
    } else {
      history = await CallService.getCallHistory(
        userId,
        validData.limit,
        validData.offset
      );
    }

    return res.status(200).json(ApiResponse.success(history || []));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
});
