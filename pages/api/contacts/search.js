import { extractUserFromRequest, handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { ContactService } from '../../../lib/services/index.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { q, limit = 50, offset = 0 } = req.query;

    if (!q) {
      throw new Error('VALIDATION_ERROR: Search query (q) is required');
    }

    const results = await ContactService.searchContacts(
      userId,
      q,
      Math.min(parseInt(limit), 100),
      parseInt(offset)
    );

    return res.status(200).json(ApiResponse.success(results));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
});
