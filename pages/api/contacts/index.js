import { extractUserFromRequest, handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { ContactService } from '../../../lib/services/index.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { limit = 50, offset = 0, search } = req.query;

    const contacts = await ContactService.getContacts(
      userId,
      Math.min(parseInt(limit), 100),
      parseInt(offset),
      search || null
    );

    const contactCount = await ContactService.getContactCount(userId);

    return res.status(200).json(
      ApiResponse.success({
        contacts,
        count: contactCount,
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
    const { friendId, friendIds } = req.body;

    if (!friendId && !friendIds) {
      throw new Error('VALIDATION_ERROR: friendId or friendIds is required');
    }

    let result;

    if (friendIds && Array.isArray(friendIds) && friendIds.length > 0) {
      result = await ContactService.bulkAddContacts(
        userId,
        friendIds.map(id => parseInt(id))
      );
    } else if (friendId) {
      result = await ContactService.addContact(userId, parseInt(friendId));
    }

    return res.status(201).json(ApiResponse.created(result));
  } catch (error) {
    return handleError(error, res);
  }
}

async function handleDelete(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { friendId, friendIds } = req.body;

    if (!friendId && !friendIds) {
      throw new Error('VALIDATION_ERROR: friendId or friendIds is required');
    }

    let result;

    if (friendIds && Array.isArray(friendIds) && friendIds.length > 0) {
      result = await ContactService.bulkRemoveContacts(
        userId,
        friendIds.map(id => parseInt(id))
      );
    } else if (friendId) {
      result = await ContactService.removeContact(userId, parseInt(friendId));
    }

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
