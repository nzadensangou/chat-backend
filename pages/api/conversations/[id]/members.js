import { extractUserFromRequest, handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../lib/withLogging.js';
import { ConversationService } from '../../../../lib/services/index.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: conversationId } = req.query;
    const { limit = 50, offset = 0 } = req.query;

    await ConversationService.checkUserInConversation(parseInt(conversationId), userId);

    const members = await ConversationService.getMembers(
      parseInt(conversationId),
      Math.min(parseInt(limit), 100),
      parseInt(offset)
    );

    const memberCount = await ConversationService.getMemberCount(parseInt(conversationId));

    return res.status(200).json(
      ApiResponse.success({
        members,
        memberCount,
      })
    );
  } catch (error) {
    return handleError(error, res);
  }
}

async function handlePost(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: conversationId } = req.query;
    const { memberId, memberIds } = req.body;

    if (!memberId && !memberIds) {
      throw new Error('VALIDATION_ERROR: memberId or memberIds is required');
    }

    let result;

    if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
      result = await ConversationService.bulkAddMembers(
        parseInt(conversationId),
        userId,
        memberIds.map(id => parseInt(id))
      );
    } else if (memberId) {
      result = await ConversationService.addMember(
        parseInt(conversationId),
        userId,
        parseInt(memberId)
      );
    }

    return res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    return handleError(error, res);
  }
}

async function handleDelete(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: conversationId } = req.query;
    const { memberId } = req.query;

    if (!memberId) {
      throw new Error('VALIDATION_ERROR: memberId is required');
    }

    const result = await ConversationService.removeMember(
      parseInt(conversationId),
      userId,
      parseInt(memberId)
    );

    return res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
  POST: handlePost,
  DELETE: handleDelete,
});

