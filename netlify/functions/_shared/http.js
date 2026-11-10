export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

export function successResponse(data, status = 200) {
  return jsonResponse(status, { data });
}

export function errorResponse(error) {
  if (error instanceof HttpError) {
    return jsonResponse(error.status, {
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  return jsonResponse(500, {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
}
