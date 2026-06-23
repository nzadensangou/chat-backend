import dotenv from 'dotenv';
dotenv.config();

import { handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { UserService } from '../../../lib/services/index.js';
import { validate } from '../../../lib/validators/index.js';

async function handlePost(req, res) {
  await corsHandler(req, res, () => {});

  try {
    console.log('📍 [Register] Received body:', req.body);
    const validData = validate.registration(req.body);
    console.log('📍 [Register] Validation passed:', validData);
    const result = await UserService.register(validData);
    console.log('📍 [Register] Registration successful:', result);

    return res.status(201).json(
      ApiResponse.created({
        alanyaID: result.alanyaID,
        alanyaPhone: result.alanyaPhone,
        nom: result.nom,
        pseudo: result.pseudo,
        token: result.token,
      })
    );
  } catch (error) {
    console.log('❌ [Register] Error caught:', error.message, error.stack);
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  POST: handlePost,
});

