import db from '../db/index.js';

export class BaseService {
  static async executeQuery(query, params = []) {
    try {
      const result = await db.query(query, params);
      return result;
    } catch (error) {
      throw new Error(`DATABASE_ERROR: ${error.message}`);
    }
  }

  static formatResponse(data, message = 'Success') {
    return {
      success: true,
      message,
      data,
    };
  }

  static throwValidationError(message) {
    throw new Error(`VALIDATION_ERROR: ${message}`);
  }

  static throwNotFoundError(resource = 'Resource') {
    throw new Error(`${resource} not found`);
  }

  static throwConflictError(message) {
    throw new Error(`CONFLICT: ${message}`);
  }
}

export default BaseService;
