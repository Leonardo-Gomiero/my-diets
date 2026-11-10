import { activateDietDraft } from './_shared/dietAdmin.js';

export default function patientDietActivate(request, dependencies) {
  return activateDietDraft(request, dependencies);
}
