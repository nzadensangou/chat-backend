// Authentication middleware - Verify JWT tokens and protect routes
import { verifyToken } from '../jwt.js';
import { API_MESSAGES } from '../utils/error-codes.js';

export const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: API_MESSAGES.UNAUTHORIZED,
      });
    }

    const token = authHeader.slice(7);
    const decoded = verifyToken(token);

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      status: 'error',
      message: err.message || API_MESSAGES.INVALID_TOKEN,
    });
  }
};

export default authMiddleware;
