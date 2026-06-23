// Format de réponse API unifié
export class ApiResponse {
  static success(data, message = 'Success', statusCode = 200) {
    return {
      status: 'success',
      statusCode,
      message,
      data,
    };
  }

  static error(message, statusCode = 500, error = null) {
    const response = {
      status: 'error',
      statusCode,
      message,
    };
    if (process.env.NODE_ENV === 'development' && error) {
      response.error = error;
    }
    return response;
  }

  static created(data, message = 'Created successfully') {
    return this.success(data, message, 201);
  }

  static updated(data, message = 'Updated successfully') {
    return this.success(data, message, 200);
  }

  static deleted(message = 'Deleted successfully') {
    return this.success(null, message, 200);
  }

  static paginated(items, total, page, limit, message = 'Success') {
    return {
      status: 'success',
      statusCode: 200,
      message,
      data: {
        items,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      },
    };
  }
}

export default ApiResponse;
