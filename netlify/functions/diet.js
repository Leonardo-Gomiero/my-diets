import {
  deleteDietForAdmin,
  duplicateDietForAdmin,
  getDietForEdit,
  updateDietDraft,
} from './_shared/dietAdmin.js';

export default function diet(request, dependencies) {
  if (request.method === 'GET') {
    return getDietForEdit(request, dependencies);
  }
  if (request.method === 'PUT') {
    return updateDietDraft(request, dependencies);
  }
  if (request.method === 'POST') {
    return duplicateDietForAdmin(request, dependencies);
  }
  if (request.method === 'DELETE') {
    return deleteDietForAdmin(request, dependencies);
  }
  return updateDietDraft(request, dependencies);
}
