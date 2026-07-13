import { verifyToken } from '../jwt.js';
import { ApiResponse } from './response.js';
import { ERROR_CODES } from './error-codes.js';
import { logger } from '../logger.js';

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

  // ✅ FIX (visibilité) : jusqu'ici handleError() construisait juste la
  // réponse JSON sans jamais rien loguer côté serveur. Comme chaque route
  // API intercepte déjà son erreur en interne (try/catch local), rien ne
  // remontait jamais jusqu'au logError() de withLogging — les 500
  // n'apparaissaient dans les logs PM2 que comme "ERROR 500", sans le
  // vrai message SQL/JS derrière. On logue donc ici, systématiquement,
  // AVANT de répondre.
  logger.error(
    { error: error.message, stack: error.stack, path: res.req?.url },
    'API handleError'
  );

  // ✅ FIX: si l'erreur est une instance typée (AppError et ses classes
  // filles — ValidationError, CallNotAllowedError, SelfCallError, etc.,
  // voir lib/errors/index.js), on utilise directement son statusCode.
  // C'est la source de vérité correcte et il faut la vérifier AVANT le
  // matching de texte ci-dessous : sans ça, une erreur typée avec un
  // message qui ne contient aucun des mots-clés reconnus (ex: "Cannot
  // call yourself", "User is blocked from calling") retombe dans le
  // 500 générique en bas, alors que son statusCode dit clairement 400.
  if (typeof error.statusCode === 'number') {
    return res.status(error.statusCode).json(
      ApiResponse.error(error.message, error.statusCode, isDevelopment ? error.code : null)
    );
  }

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

  return res.status(500).json(
    ApiResponse.error(
      ERROR_CODES.INTERNAL_ERROR.message,
      500,
      isDevelopment ? error.message : null
    )
  );
}

export default { extractUserFromRequest, handleError };