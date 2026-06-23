import { extractUserFromRequest, handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { ContactService } from '../../../lib/services/index.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: friendId } = req.query;

    const isContact = await ContactService.isContact(userId, parseInt(friendId));

    return res.status(200).json(
      ApiResponse.success({
        friendId: parseInt(friendId),
        isContact,
      })
    );
  } catch (error) {
    return handleError(error, res);
  }
}

async function handleDelete(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: friendId } = req.query;

    const result = await ContactService.removeContact(userId, parseInt(friendId));

    return res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    return handleError(error, res);
  }
}

async function handlePatch(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const { id: friendId } = req.query;
    const { favorite } = req.body;

    const friendIdInt = parseInt(friendId);
    const alreadyContact = await ContactService.isContact(userId, friendIdInt);

    let result;
    if (favorite && !alreadyContact) {
      result = await ContactService.addContact(userId, friendIdInt);
    } else if (!favorite && alreadyContact) {
      result = await ContactService.removeContact(userId, friendIdInt);
    } else {
      result = { message: 'Already up to date' };
    }

    return res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    console.log('❌ PATCH favorite error:', error.message);
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
  DELETE: handleDelete,
  PATCH: handlePatch,
});
