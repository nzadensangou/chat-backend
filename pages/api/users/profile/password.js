import { extractUserFromRequest, handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../lib/withLogging.js';
import { UserService } from '../../../../lib/services/index.js';
import { validate } from '../../../../lib/validators/index.js';

async function handlePut(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    // 🔐 SECURITY: User can only change their own password via JWT userId
    // No ID parameter needed - inherently restricted to authenticated user
    const validData = validate.passwordChange(req.body);

    const result = await UserService.changePassword(userId, validData.currentPassword, validData.newPassword);

    return res.status(200).json(ApiResponse.updated(result));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  PUT: handlePut,
});

