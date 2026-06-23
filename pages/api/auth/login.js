import { handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { UserService } from '../../../lib/services/index.js';
import { validate } from '../../../lib/validators/index.js';

async function handlePost(req, res) {
  await corsHandler(req, res, () => {});

  try {
    const validData = validate.login(req.body);
    const result = await UserService.login(validData);

    return res.status(200).json(
      ApiResponse.success({
        alanyaID: result.alanyaID,
        alanyaPhone: result.alanyaPhone,
        nom: result.nom,
        pseudo: result.pseudo,
        avatar_url: result.avatar_url,
        type_compte: result.type_compte,
        is_online: result.is_online,
        token: result.token,
      })
    );
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  POST: handlePost,
});

