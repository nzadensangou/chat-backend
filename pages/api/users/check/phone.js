import { handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers } from '../../../../lib/withLogging.js';
import { UserService } from '../../../../lib/services/index.js';

async function handleGet(req, res) {
  try {
    let { phone } = req.query;
    if (Array.isArray(phone)) {
      phone = phone[0];
    }

    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
      throw new Error('VALIDATION_ERROR: Phone number is required');
    }

    const normalizedPhone = phone.trim().replace(/\D/g, '');
    if (!/^[0-9]{6}$/.test(normalizedPhone)) {
      throw new Error('VALIDATION_ERROR: Phone must be exactly 6 digits');
    }

    const isAvailable = await UserService.checkPhoneAvailable(normalizedPhone);

    return res.status(200).json(
      ApiResponse.success({
        phone: normalizedPhone,
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

