import { extractUserFromRequest, handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../lib/withLogging.js';
import { CallService } from '../../../../lib/services/index.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const callerId = extractUserFromRequest(req);
    const { receiverId } = req.query;

    if (!receiverId) {
      throw new Error('VALIDATION_ERROR: receiverId is required');
    }

    const receiverIdInt = parseInt(receiverId);
    if (isNaN(receiverIdInt) || receiverIdInt <= 0) {
      throw new Error('VALIDATION_ERROR: Invalid receiver ID');
    }

    // Check if can call
    const canCall = await CallService.canCallUser(callerId, receiverIdInt);

    // If can't call, determine why
    let reason = null;
    if (!canCall) {
      const isInContacts = await CallService.isUserInContacts(callerId, receiverIdInt);
      if (!isInContacts) {
        reason = 'User not in contacts';
      } else {
        reason = 'User blocked';
      }
    }

    return res.status(200).json(
      ApiResponse.success({
        receiverId: receiverIdInt,
        canCall,
        reason,
      })
    );
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
});
