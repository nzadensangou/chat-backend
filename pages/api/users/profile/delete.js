import { extractUserFromRequest, handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../lib/withLogging.js';
import { UserService } from '../../../../lib/services/index.js';
import { validate } from '../../../../lib/validators/index.js';
import bcryptjs from 'bcryptjs';

async function handleDelete(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const validData = validate.userDeletion(req.body);

    const user = await UserService.getUserById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    const isPasswordValid = await bcryptjs.compare(validData.password, user.password);

    if (!isPasswordValid) {
      throw new Error('VALIDATION_ERROR: Invalid password');
    }

    const result = await UserService.deleteAccount(userId);

    return res.status(200).json(ApiResponse.deleted());
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  DELETE: handleDelete,
});

