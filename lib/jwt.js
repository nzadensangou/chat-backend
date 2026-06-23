import jwt from 'jsonwebtoken';
import { API_MESSAGES } from './utils/error-codes.js';

export class TokenError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export const verifyToken = (token) => {
  try {
    if (!token) {
      throw new TokenError(API_MESSAGES.INVALID_TOKEN, 'NO_TOKEN');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new TokenError(API_MESSAGES.TOKEN_EXPIRED, 'TOKEN_EXPIRED');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new TokenError(API_MESSAGES.INVALID_TOKEN, 'INVALID_TOKEN');
    }
    throw new TokenError(err.message || API_MESSAGES.INVALID_TOKEN, 'JWT_ERROR');
  }
};

export const generateToken = (payload) => {
  if (!payload) {
    throw new Error('Payload is required for token generation');
  }

  return jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key-change-in-production', {
    expiresIn: process.env.JWT_EXPIRATION || '7d',
    algorithm: 'HS256',
  });
};

export const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        statusCode: 401,
        message: API_MESSAGES.UNAUTHORIZED,
      });
    }

    const token = authHeader.slice(7);
    const decoded = verifyToken(token);

    req.user = decoded;
    next();
  } catch (err) {
    const statusCode = err.code === 'TOKEN_EXPIRED' ? 401 : 401;
    return res.status(statusCode).json({
      status: 'error',
      statusCode,
      message: err.message || API_MESSAGES.INVALID_TOKEN,
    });
  }
};

export default { verifyToken, generateToken, authMiddleware };

