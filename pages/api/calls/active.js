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
             u.pseudo as organizerName, u.pseudo as organizerPseudo, u.avatar_url as organizerAvatar,
             COUNT(DISTINCT p.IDparticipant) as participantCount
      FROM meeting m
      INNER JOIN participant p ON m.idMeeting = p.idMeeting
      INNER JOIN users u ON m.idOrganiser = u.alanyaID
      WHERE p.IDparticipant = ? AND m.isEnd = 0
      GROUP BY m.idMeeting
      ORDER BY m.start_time DESC
    `;

    const rows = await db.getAll(query, [userId]);

    return res.status(200).json(ApiResponse.success(rows || []));
  } catch (error) {
    console.error('❌ [DEBUG] /api/calls/active a échoué:', error); // TEMP - à retirer après debug
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
});