import { handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers } from '../../../../lib/withLogging.js';
import { UserService } from '../../../../lib/services/index.js';

async function handleGet(req, res) {
  try {
    let { countryId } = req.query;
    if (Array.isArray(countryId)) {
      countryId = countryId[0];
    }

    let parsedCountryId = null;
    if (countryId !== undefined && countryId !== null && String(countryId).trim() !== '') {
      parsedCountryId = Number(countryId);
      if (Number.isNaN(parsedCountryId) || parsedCountryId <= 0) {
        throw new Error('VALIDATION_ERROR: countryId must be a positive integer');
      }
    }

    const phone = await UserService.generateAvailablePhoneNumber(parsedCountryId);

    return res.status(200).json(
      ApiResponse.success({
        phone,
        countryId: parsedCountryId,
      })
    );
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
});
