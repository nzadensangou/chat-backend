import { extractUserFromRequest, handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { UserService } from '../../../lib/services/index.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    extractUserFromRequest(req);
    // 🔓 PUBLIC ENDPOINT: Any authenticated user can search for other users
    // This allows users to discover and start conversations with any registered user
    // No additional authorization checks - intentionally open for all authenticated users
    const { q: query, limit = 50, offset = 0 } = req.query;

    if (!query || typeof query !== 'string' || query.trim() === '') {
      throw new Error('VALIDATION_ERROR: Search query is required');
    }

    const queryLimit = parseInt(limit);
    const queryOffset = parseInt(offset);

    if (isNaN(queryLimit) || queryLimit <= 0 || queryLimit > 100) {
      throw new Error('VALIDATION_ERROR: Invalid limit - must be between 1 and 100');
    }

    if (isNaN(queryOffset) || queryOffset < 0) {
      throw new Error('VALIDATION_ERROR: Invalid offset - must be >= 0');
    }

    const results = await UserService.searchUsers(query.trim(), Math.min(queryLimit, 100), queryOffset);

    return res.status(200).json(ApiResponse.success(results));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
});

