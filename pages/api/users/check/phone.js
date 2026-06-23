import { handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers } from '../../../../lib/withLogging.js';
import { UserService } from '../../../../lib/services/index.js';

async function handleGet(req, res) {
  try {
    const { phone } = req.query;

    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
      throw new Error('VALIDATION_ERROR: Phone number is required');
    }

    const isAvailable = await UserService.checkPhoneAvailable(phone.trim());

    return res.status(200).json(
      ApiResponse.success({
        phone: phone.trim(),
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

