import { extractUserFromRequest, handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { CallService } from '../../../lib/services/index.js';
import { validate } from '../../../lib/validators/index.js';

async function handlePost(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const callerId = extractUserFromRequest(req);
    const { receiverId, callType, room } = req.body;

    // Validate input
    const validData = validate.callInitiation({
      receiverId,
      callType,
      room,
    });

    // Initiate call
    const result = await CallService.initiateCall(callerId, validData);

    return res.status(201).json(ApiResponse.created(result));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  POST: handlePost,
});
