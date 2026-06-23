import { extractUserFromRequest, handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import db from '../../../lib/db/index.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);

    const query = `
      SELECT m.*,
             u.nom as callerName, u.pseudo as callerPseudo, u.avatar_url as callerAvatar,
             u.alanyaID as callerId
      FROM meeting m
      INNER JOIN users u ON m.idOrganiser = u.alanyaID
      WHERE m.idMeeting NOT IN (
        SELECT idMeeting FROM participant WHERE IDparticipant = ?
      )
      AND m.idOrganiser IN (
        SELECT idFriend FROM preferredContact WHERE alanyaID = ?
      )
      AND m.isEnd = 0
      ORDER BY m.start_time DESC
    `;

    const rows = await db.getAll(query, [userId, userId]);

    return res.status(200).json(ApiResponse.success(rows || []));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
});
