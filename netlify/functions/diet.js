import {
  getDietForEdit,
  updateDietDraft,
} from './_shared/dietAdmin.js';

export default function diet(request, dependencies) {
  if (request.method === 'GET') {
    return getDietForEdit(request, dependencies);
  }
  return updateDietDraft(request, dependencies);
}
