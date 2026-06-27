import { verifyToken } from '../jwt.js';
import { ApiResponse } from './response.js';
import { ERROR_CODES } from './error-codes.js';
import { logError } from '../logger.js';

export function extractUserFromRequest(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    throw new Error('UNAUTHORIZED');
  }
  try {
    const decoded = verifyToken(token);
    const userId = parseInt(decoded.alanyaID, 10);
    // Assigne l'utilisateur à req.user pour utilisation dans les handlers
    req.user = { id: userId, alanyaID: userId };
    return userId;
  } catch (error) {
    throw new Error('UNAUTHORIZED');
  }
}

export function handleError(error, res, isDev = false) {
  const isDevelopment = isDev || process.env.NODE_ENV === 'development';

  if (error.message === 'UNAUTHORIZED' || error.message.includes('UNAUTHORIZED')) {
    return res.status(401).json(
      ApiResponse.error(ERROR_CODES.UNAUTHORIZED.message, 401)
    );
  }

  if (error.message.includes('VALIDATION_ERROR') || error.message.includes('validation')) {
    return res.status(400).json(
      ApiResponse.error(ERROR_CODES.VALIDATION_ERROR.message, 400, isDevelopment ? error.message : null)
    );
  }

  if (error.message.includes('NOT_FOUND') || error.message.includes('not found')) {
    return res.status(404).json(
      ApiResponse.error(ERROR_CODES.NOT_FOUND.message, 404)
    );
  }

  if (error.message.includes('CONFLICT') || error.message.includes('already exists')) {
    return res.status(409).json(
      ApiResponse.error(ERROR_CODES.CONFLICT.message, 409)
    );
  }

  if (error.message.includes('FORBIDDEN') || error.message.includes('Access denied')) {
    return res.status(403).json(
      ApiResponse.error(ERROR_CODES.FORBIDDEN.message, 403)
    );
  }

  // Erreur non reconnue = erreur serveur inattendue (bug, SQL, etc.)
  // On logue le détail complet ici, car c'est le seul cas où on a
  // VRAIMENT besoin de voir le message + la stack trace pour debug.
  logError(error, { statusCode: 500 });

  return res.status(500).json(
    ApiResponse.error(
      ERROR_CODES.INTERNAL_ERROR.message,
      500,
      isDevelopment ? error.message : null
    )
  );
}

export default { extractUserFromRequest, handleError };