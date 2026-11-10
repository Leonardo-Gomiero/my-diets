import { authenticateRequest } from './_shared/auth.js';
import { HttpError, errorResponse, successResponse } from './_shared/http.js';
import { createServerSupabaseClient } from './_shared/supabase.js';

const VALID_ROLES = new Set(['ADMIN', 'STUDENT']);

export default async function me(
  request,
  {
    authenticate = authenticateRequest,
    createAdminClient = createServerSupabaseClient,
  } = {},
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

    const {
      nutritionist_details: nutritionistDetails,
      ...publicProfile
    } = profile;
    const ownDetails = Array.isArray(nutritionistDetails)
      ? nutritionistDetails[0]
      : nutritionistDetails;

    if (profile.role === 'ADMIN') {
      return successResponse({
        user: { id: user.id, email: user.email },
        profile: {
          ...publicProfile,
          ...(profile.full_name ? { full_name: profile.full_name } : {}),
          ...(ownDetails ? { whatsapp: ownDetails.phone ?? null } : {}),
        },
      });
    }

    let nutritionist = null;
    if (profile.nutritionist_id) {
      let result;
      try {
        result = await createAdminClient()
          .from('profiles')
          .select('id, full_name, nutritionist_details(phone)')
          .eq('id', profile.nutritionist_id)
          .eq('role', 'ADMIN')
          .maybeSingle();
      } catch {
        throw new HttpError(
          503,
          'PROFILE_LOOKUP_UNAVAILABLE',
          'Não foi possível verificar sua conta. Tente novamente.',
        );
      }

      if (result.error) {
        throw new HttpError(
          503,
          'PROFILE_LOOKUP_UNAVAILABLE',
          'Não foi possível verificar sua conta. Tente novamente.',
        );
      }
      if (result.data) {
        const details = Array.isArray(result.data.nutritionist_details)
          ? result.data.nutritionist_details[0]
          : result.data.nutritionist_details;
        nutritionist = {
          id: result.data.id,
          full_name: result.data.full_name,
          whatsapp: details?.phone ?? null,
        };
      }
    }

    return successResponse({
      user: { id: user.id, email: user.email },
      profile: publicProfile,
      nutritionist,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
