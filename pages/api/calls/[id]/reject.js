import { extractUserFromRequest, handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../lib/withLogging.js';
import { CallService } from '../../../../lib/services/index.js';
import { validate } from '../../../../lib/validators/index.js';

async function handlePost(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const receiverId = extractUserFromRequest(req);
    const { id: meetingId } = req.query;
    const { reason } = req.body;

    // Validate meeting ID
    const meetingIdInt = parseInt(meetingId);
    if (isNaN(meetingIdInt) || meetingIdInt <= 0) {
      throw new Error('VALIDATION_ERROR: Invalid meeting ID');
    }

    // Validate input
    const validData = validate.callReject({
      meetingId: meetingIdInt,
      reason,
    });

    // Reject call
    const result = await CallService.rejectCall(validData.meetingId, receiverId, {
      reason: validData.reason,
    });

    return res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  POST: handlePost,
});
