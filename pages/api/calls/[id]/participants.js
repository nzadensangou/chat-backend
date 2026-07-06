import { extractUserFromRequest, handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../lib/withLogging.js';
import { CallService } from '../../../../lib/services/index.js';
import { enforceCallPermission } from '../../../../lib/middleware/authorization.js';
import { validate } from '../../../../lib/validators/index.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: meetingId } = req.query;

    // Get participants
    const meetingIdInt = parseInt(meetingId);

    if (isNaN(meetingIdInt) || meetingIdInt <= 0) {
      throw new Error('VALIDATION_ERROR: Invalid meeting ID');
    }

    // 🔐 AUTHORIZATION CHECK: User must be organizer or participant
    await enforceCallPermission(userId, meetingIdInt);

    // Verify meeting exists
    const meeting = await CallService.getMeetingDetails(meetingIdInt);
    if (!meeting) {
      throw new Error('NOT_FOUND: Meeting not found');
    }

    // Get participants
    const participants = await CallService.getMeetingParticipants(meetingIdInt);

    return res.status(200).json(
      ApiResponse.success({
        participants,
        count: participants ? participants.length : 0,
      })
    );
  } catch (error) {
    return handleError(error, res);
  }
}

// ✅ FIX (bug "impossible d'inviter plusieurs participants à une réunion") :
// CallService.addParticipant() existait déjà, entièrement fonctionnel,
// mais AUCUNE route ne l'exposait — seul un GET existait dans ce fichier.
// C'est ce POST, appelé une fois par participant supplémentaire choisi
// dans MeetingParticipantsScreen (voir meeting_provider.dart côté
// Flutter), qui permet enfin d'inviter plus d'une personne : le premier
// participant part toujours via /api/calls/initiate (qui crée la réunion
// elle-même), et chaque participant suivant est ajouté ici.
async function handlePost(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: meetingId } = req.query;

    const meetingIdInt = parseInt(meetingId);
    if (isNaN(meetingIdInt) || meetingIdInt <= 0) {
      throw new Error('VALIDATION_ERROR: Invalid meeting ID');
    }

    // ✅ Seul l'organisateur peut inviter — contrairement à la lecture des
    // participants (GET, ouverte à tout participant), on vérifie ici
    // directement idOrganiser plutôt que d'utiliser enforceCallPermission
    // (qui autoriserait aussi n'importe quel participant déjà présent à en
    // inviter d'autres, ce qui n'est pas le comportement voulu ici).
    const meeting = await CallService.getMeetingDetails(meetingIdInt);
    if (!meeting) {
      throw new Error('NOT_FOUND: Meeting not found');
    }
    if (Number(meeting.idOrganiser) !== Number(userId)) {
      throw new Error('Access denied: only the organizer can add participants');
    }

    const validData = validate.addParticipant({
      meetingId: meetingIdInt,
      participantId: req.body.participantId,
    });

    const result = await CallService.addParticipant(
      validData.meetingId,
      validData.participantId,
      {}
    );

    return res.status(201).json(ApiResponse.created(result));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
  POST: handlePost,
});