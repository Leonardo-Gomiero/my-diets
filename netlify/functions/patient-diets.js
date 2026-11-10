import { createPatientDiet } from './_shared/dietAdmin.js';

export default function patientDiets(request, dependencies) {
  return createPatientDiet(request, dependencies);
}
