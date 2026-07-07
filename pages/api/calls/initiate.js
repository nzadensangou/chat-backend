import { extractUserFromRequest, handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { CallService } from '../../../lib/services/index.js';

async function handlePost(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const callerId = extractUserFromRequest(req);
    const { receiverId, callType, room, title, scheduledStartTime, scheduledEndTime } = req.body;

    // ✅ FIX (bug "réunion toujours classée Complétée") : cette route
    // validait déjà le payload ICI, puis le repassait à
    // CallService.initiateCall() qui le VALIDE À NOUVEAU en interne. Or la
    // première validation renomme scheduledStartTime/scheduledEndTime en
    // plannedStartTime/plannedDurationSeconds — la seconde validation ne
    // trouvait donc plus jamais scheduledStartTime/scheduledEndTime et
    // réinitialisait silencieusement plannedStartTime à null (→ start_time
    // = NOW(), duree = 0 à chaque création, peu importe la date choisie).
    // On transmet maintenant les champs BRUTS et on laisse
    // CallService.initiateCall() être l'unique point de validation.
    const result = await CallService.initiateCall(callerId, {
      receiverId,
      callType,
      room,
      title,
      scheduledStartTime,
      scheduledEndTime,
    });

    return res.status(201).json(ApiResponse.created(result));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  POST: handlePost,
});