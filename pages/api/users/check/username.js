import { handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers } from '../../../../lib/withLogging.js';
import { UserService } from '../../../../lib/services/index.js';

async function handleGet(req, res) {
  try {
    const { username } = req.query;

    if (!username || typeof username !== 'string' || username.trim() === '') {
      throw new Error('VALIDATION_ERROR: Username is required');
    }

    if (username.length < 3 || username.length > 20) {
      throw new Error('VALIDATION_ERROR: Username must be between 3 and 20 characters');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      throw new Error('VALIDATION_ERROR: Username can only contain letters, numbers, underscores, and dashes');
    }

    const isAvailable = await UserService.checkUsernameAvailable(username.trim());

    return res.status(200).json(
      ApiResponse.success({
        username: username.trim(),
        available: isAvailable,
      })
    );
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
});

