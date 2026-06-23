import { extractUserFromRequest, handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../lib/withLogging.js';
import { CallService } from '../../../../lib/services/index.js';
import { enforceCallPermission } from '../../../../lib/middleware/authorization.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: meetingId } = req.query;

    // Get call details
    const meetingIdInt = parseInt(meetingId);

    if (isNaN(meetingIdInt) || meetingIdInt <= 0) {
      throw new Error('VALIDATION_ERROR: Invalid meeting ID');
    }

    // 🔐 AUTHORIZATION CHECK: User must be organizer or participant
    await enforceCallPermission(userId, meetingIdInt);

    // Get meeting details
    const meeting = await CallService.getMeetingDetails(meetingIdInt);

    if (!meeting) {
      throw new Error('NOT_FOUND: Meeting not found');
    }

    // Get participants
    const participants = await CallService.getMeetingParticipants(meetingIdInt);

    return res.status(200).json(
      ApiResponse.success({
        ...meeting,
        participants,
        participantCount: participants ? participants.length : 0,
      })
    );
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
});
