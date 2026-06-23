import { extractUserFromRequest, handleError } from '../../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../../lib/withLogging.js';
import { UserService } from '../../../../lib/services/index.js';
import { validate } from '../../../../lib/validators/index.js';

async function handlePut(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const userId = extractUserFromRequest(req);
    const validData = validate.profileUpdate(req.body);

    const result = await UserService.updateProfile(userId, validData);

    return res.status(200).json(
      ApiResponse.updated({
        alanyaID: result.alanyaID,
        nom: result.nom,
        pseudo: result.pseudo,
        avatarUrl: result.avatarUrl,
        typeCompte: result.typeCompte,
      })
    );
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  PUT: handlePut,
});

