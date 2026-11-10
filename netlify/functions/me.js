import { authenticateRequest } from './_shared/auth.js';
import { HttpError, errorResponse, successResponse } from './_shared/http.js';

const VALID_ROLES = new Set(['ADMIN', 'STUDENT']);

export default async function me(
  request,
  { authenticate = authenticateRequest } = {},
) {
  if (request.method !== 'GET') {
    return errorResponse(
      new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only GET is supported.'),
    );
  }

  try {
    const { user, profile } = await authenticate(request);

    if (!VALID_ROLES.has(profile.role)) {
      throw new HttpError(403, 'INVALID_ROLE', 'Account access is not available.');
    }

    if (!profile.is_active) {
      throw new HttpError(403, 'ACCOUNT_INACTIVE', 'This account is inactive.');
    }

    return successResponse({
      user: { id: user.id, email: user.email },
      profile,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
