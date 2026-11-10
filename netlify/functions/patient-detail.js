import { getPatient, updatePatient } from './_shared/patientAdmin.js';

export default function patientDetail(request, dependencies) {
  if (request.method === 'GET') {
    return getPatient(request, dependencies);
  }
  if (request.method === 'PUT') {
    return updatePatient(request, dependencies);
  }

  return getPatient(request, dependencies);
}
