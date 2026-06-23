import { extractUserFromRequest, handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { StatusService } from '../../../lib/services/index.js';
import { validate } from '../../../lib/validators/index.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { limit = 50, offset = 0 } = req.query;

    const validData = validate.status.validateGetContactStories({
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    const statuses = await StatusService.getContactStatuses(
      userId,
      validData.limit,
      validData.offset
    );

    return res.status(200).json(ApiResponse.success(statuses));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
});
