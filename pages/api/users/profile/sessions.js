import { extractUserFromRequest, handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../lib/withLogging.js';
import db from '../../../../lib/db/index.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);

    const query = `
      SELECT *
      FROM userAccess
      WHERE alanyaID = ?
      ORDER BY dateLogin DESC
      LIMIT 50
    `;

    const rows = await db.getAll(query, [userId]);

    return res.status(200).json(ApiResponse.success(rows || []));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
});

