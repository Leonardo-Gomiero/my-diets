import { updateDietDraft } from './_shared/dietAdmin.js';

export default function diet(request, dependencies) {
  return updateDietDraft(request, dependencies);
}
