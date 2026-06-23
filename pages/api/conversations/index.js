import { extractUserFromRequest, handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { ConversationService } from '../../../lib/services/index.js';
import { validate } from '../../../lib/validators/index.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { limit = 50, offset = 0, archived = false, search } = req.query;

    const conversations = await ConversationService.getConversations(
      userId,
      Math.min(parseInt(limit), 100),
      parseInt(offset),
      {
        archived: archived === 'true' || archived === true,
        search: search || null,
      }
    );

    return res.status(200).json(ApiResponse.success(conversations));
  } catch (error) {
    return handleError(error, res);
  }
}

async function handlePost(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { type, recipientId, groupName, memberIds } = req.body;

    let result;

    if (type === 'dm') {
      if (!recipientId) {
        throw new Error('VALIDATION_ERROR: recipientId is required for DM');
      }
      result = await ConversationService.createDirectMessage(userId, parseInt(recipientId));
    } else if (type === 'group') {
      const validData = validate.groupCreation(req.body);
      result = await ConversationService.createGroup(userId, validData);
    } else {
      throw new Error('VALIDATION_ERROR: type must be "dm" or "group"');
    }

    return res.status(201).json(ApiResponse.created(result));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
  POST: handlePost,
});

