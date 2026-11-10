import { useEffect, useRef, useState } from 'react';
import {
  FiArrowLeft,
  FiCopy,
  FiPlus,
  FiSearch,
  FiSettings,
  FiUsers,
} from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  createPatient,
  getPatient,
  getPatients,
  resetPatientPassword,
  updatePatient,
  updatePatientStatus,
} from '../services/patientService.js';
import { whatsappUrl } from '../utils/contactLinks.js';
import './PatientsPage.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY_FORM = {
  full_name: '',
  email: '',
  phone: '',
};

function validatePatient(form) {
  const errors = {};
  const fullName = form.full_name.trim();
  const email = form.email.trim();

  if (!fullName || fullName.length > 200) {
    errors.full_name = 'Informe o nome completo (até 200 caracteres).';
  }

  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Informe um e-mail válido.';
  }

  return errors;
}

function PatientForm({ onCancel, onCreated, accessToken }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: '' }));
    setFormError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = validatePatient(form);
    setFieldErrors(errors);
    setFormError('');

    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await createPatient(
        {
          full_name: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        },
        { accessToken },
      );
      onCreated(result);
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="patients-panel patients-form-panel" aria-labelledby="patient-form-title">
      <button className="patients-back" type="button" onClick={onCancel}>
        <FiArrowLeft aria-hidden="true" />
        Voltar à lista
      </button>
      <div className="patients-panel__heading">
        <span className="eyebrow patients-eyebrow">NOVO CADASTRO</span>
        <h2 id="patient-form-title">Adicionar paciente</h2>
        <p>Preencha os dados básicos para criar o acesso.</p>
      </div>

      <form className="patient-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <p className="patients-alert" role="alert">
            {formError}
          </p>
        )}

        <label className="patient-form__field" htmlFor="patient-full-name">
          Nome completo
          <input
            id="patient-full-name"
            name="full_name"
            autoComplete="name"
            maxLength={200}
            required
            value={form.full_name}
            onChange={updateField}
            aria-invalid={Boolean(fieldErrors.full_name)}
            aria-describedby={fieldErrors.full_name ? 'patient-full-name-error' : undefined}
          />
          {fieldErrors.full_name && (
            <span className="patient-form__field-error" id="patient-full-name-error">
              {fieldErrors.full_name}
            </span>
          )}
        </label>

        <label className="patient-form__field" htmlFor="patient-email">
          E-mail
          <input
            id="patient-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            value={form.email}
            onChange={updateField}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'patient-email-error' : undefined}
          />
          {fieldErrors.email && (
            <span className="patient-form__field-error" id="patient-email-error">
              {fieldErrors.email}
            </span>
          )}
        </label>

        <label className="patient-form__field" htmlFor="patient-phone">
          Telefone <span className="patient-form__optional">(opcional)</span>
          <input
            id="patient-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={32}
            value={form.phone}
            onChange={updateField}
          />
        </label>

        <p className="patient-form__note">
          Uma senha temporária será gerada e exibida uma única vez após o cadastro.
        </p>
        <div className="patient-form__actions">
          <Button type="button" variant="quiet" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Criando…' : 'Criar paciente'}
          </Button>
        </div>
      </form>
    </section>
  );
}

function PatientEditForm({ patient, accessToken, onCancel, onSaved }) {
  const [form, setForm] = useState({
    full_name: patient.full_name,
    email: patient.email,
    phone: patient.phone ?? '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: '' }));
    setFormError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = validatePatient(form);
    setFieldErrors(errors);
    setFormError('');
    if (Object.keys(errors).length) {
      return;
    }

    setSaving(true);
    try {
      const savedPatient = await updatePatient(
        patient.id,
        {
          full_name: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || null,
        },
        { accessToken },
      );
      onSaved(savedPatient);
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="patients-panel patients-form-panel" aria-labelledby="patient-edit-title">
      <button className="patients-back" type="button" onClick={onCancel} disabled={saving}>
        <FiArrowLeft aria-hidden="true" />
        Voltar à lista
      </button>
      <div className="patients-panel__heading">
        <span className="eyebrow patients-eyebrow">DADOS DO PACIENTE</span>
        <h2 id="patient-edit-title">Editar cadastro</h2>
        <p>Atualize as informações básicas do paciente.</p>
      </div>
      <form className="patient-form" onSubmit={handleSubmit} noValidate>
        {formError && <p className="patients-alert" role="alert">{formError}</p>}
        <label className="patient-form__field" htmlFor="edit-patient-full-name">
          Nome completo
          <input
            id="edit-patient-full-name"
            name="full_name"
            autoComplete="name"
            maxLength={200}
            required
            value={form.full_name}
            onChange={updateField}
            aria-invalid={Boolean(fieldErrors.full_name)}
            aria-describedby={fieldErrors.full_name ? 'edit-patient-name-error' : undefined}
          />
          {fieldErrors.full_name && (
            <span className="patient-form__field-error" id="edit-patient-name-error">
              {fieldErrors.full_name}
            </span>
          )}
        </label>
        <label className="patient-form__field" htmlFor="edit-patient-email">
          E-mail
          <input
            id="edit-patient-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            value={form.email}
            onChange={updateField}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'edit-patient-email-error' : undefined}
          />
          {fieldErrors.email && (
            <span className="patient-form__field-error" id="edit-patient-email-error">
              {fieldErrors.email}
            </span>
          )}
        </label>
        <label className="patient-form__field" htmlFor="edit-patient-phone">
          Telefone <span className="patient-form__optional">(opcional)</span>
          <input
            id="edit-patient-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={32}
            value={form.phone}
            onChange={updateField}
          />
        </label>
        <div className="patient-form__actions">
          <Button type="button" variant="quiet" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </div>
      </form>
    </section>
  );
}

function TemporaryPassword({ patient, password, onClose, isReset = false }) {
  const [copyMessage, setCopyMessage] = useState('');

  async function copyPassword() {
    setCopyMessage('');
    try {
      await navigator.clipboard.writeText(password);
      setCopyMessage('Senha copiada.');
    } catch {
      setCopyMessage('Não foi possível copiar. Selecione e copie a senha manualmente.');
    }
  }

  return (
    <section className="patients-panel password-result" aria-labelledby="password-result-title">
      <span className="password-result__icon" aria-hidden="true">
        <FiUsers />
      </span>
      <span className="eyebrow patients-eyebrow">ACESSO CRIADO</span>
      <h1 id="password-result-title">
        {isReset ? 'Senha redefinida' : 'Cadastro concluído'}
      </h1>
      <p className="password-result__patient">
        A senha temporária de <strong>{patient.full_name}</strong> só aparece nesta tela.
      </p>
      <div className="password-result__warning" role="note">
        {isReset
          ? 'Anote ou compartilhe esta senha agora. Ao fechar esta tela, ela será descartada e não poderá ser consultada novamente.'
          : 'Anote ou compartilhe esta senha agora. Ao sair desta tela, ela será descartada e não poderá ser consultada novamente.'}
      </div>
      <div className="password-result__credential">
        <span>Senha temporária</span>
        <output role="group" aria-label="Senha temporária">{password}</output>
      </div>
      {copyMessage && (
        <p className="password-result__copy-message" role="status" aria-live="polite">
          {copyMessage}
        </p>
      )}
      <div className="password-result__actions">
        <Button type="button" variant="quiet" onClick={onClose}>
          Voltar à lista
        </Button>
        <Button type="button" onClick={copyPassword}>
          <FiCopy aria-hidden="true" />
          Copiar senha
        </Button>
      </div>
    </section>
  );
}

export default function PatientsPage() {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [patients, setPatients] = useState([]);
  const [listStatus, setListStatus] = useState('loading');
  const [listError, setListError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [reloadCount, setReloadCount] = useState(0);
  const [view, setView] = useState('list');
  const [createdPatient, setCreatedPatient] = useState(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [passwordIsReset, setPasswordIsReset] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [changingStatusId, setChangingStatusId] = useState('');
  const [openPatientMenuId, setOpenPatientMenuId] = useState('');
  const patientMenuRef = useRef(null);

  useEffect(() => {
    if (!openPatientMenuId) return undefined;

    function closeOnOutsideClick(event) {
      if (!patientMenuRef.current?.contains(event.target)) {
        setOpenPatientMenuId('');
      }
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setOpenPatientMenuId('');
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openPatientMenuId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    setListStatus('loading');
    setListError('');

    getPatients({
      search,
      accessToken,
      signal: controller.signal,
    })
      .then((result) => {
        setPatients(result);
        setListStatus('success');
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          return;
        }
        setListError(error.message);
        setListStatus('error');
      });

    return () => controller.abort();
  }, [accessToken, search, reloadCount]);

  function handleCreated(result) {
    setCreatedPatient(result.patient);
    setTemporaryPassword(result.temporary_password);
    setPasswordIsReset(false);
    setView('password');
  }

  function discardTemporaryPassword() {
    setTemporaryPassword('');
    setCreatedPatient(null);
    setPasswordIsReset(false);
    setView('list');
    setReloadCount((count) => count + 1);
  }

  async function handlePasswordReset(patient) {
    if (
      !window.confirm(
        `Redefinir a senha de ${patient.full_name}? A senha atual deixará de funcionar e o próximo acesso exigirá a criação de uma nova senha.`,
      )
    ) {
      return;
    }

    setChangingStatusId(patient.id);
    setStatusError('');
    try {
      const result = await resetPatientPassword(patient.id, { accessToken });
      setCreatedPatient(result.patient);
      setTemporaryPassword(result.temporary_password);
      setPasswordIsReset(true);
      setView('password');
    } catch (error) {
      setStatusError(error.message);
    } finally {
      setChangingStatusId('');
    }
  }

  async function openPatient(patient) {
    setView('edit-loading');
    setDetailError('');
    try {
      const details = await getPatient(patient.id, { accessToken });
      setSelectedPatient(details);
      setView('edit');
    } catch (error) {
      setDetailError(error.message);
      setView('edit-error');
    }
  }

  function handlePatientSaved(updatedPatient) {
    setPatients((current) =>
      current.map((patient) =>
        patient.id === updatedPatient.id ? updatedPatient : patient,
      ),
    );
    setSelectedPatient(null);
    setView('list');
  }

  async function handleStatusChange(patient) {
    const nextStatus = !patient.is_active;
    if (
      patient.is_active &&
      !window.confirm(
        `Desativar ${patient.full_name}? A pessoa perderá o acesso, mas o perfil e o histórico de dietas serão preservados.`,
      )
    ) {
      return;
    }

    setChangingStatusId(patient.id);
    setStatusError('');
    try {
      const updatedPatient = await updatePatientStatus(
        patient.id,
        nextStatus,
        { accessToken },
      );
      setPatients((current) =>
        current.map((item) =>
          item.id === updatedPatient.id
            ? { ...item, is_active: updatedPatient.is_active }
            : item,
        ),
      );
    } catch (error) {
      setStatusError(error.message);
    } finally {
      setChangingStatusId('');
    }
  }

  if (view === 'password' && createdPatient && temporaryPassword) {
    return (
      <TemporaryPassword
        patient={createdPatient}
        password={temporaryPassword}
        isReset={passwordIsReset}
        onClose={discardTemporaryPassword}
      />
    );
  }

  if (view === 'form') {
    return (
      <PatientForm
        accessToken={accessToken}
        onCancel={() => setView('list')}
        onCreated={handleCreated}
      />
    );
  }

  if (view === 'edit-loading') {
    return (
      <div className="patients-state" role="status" aria-live="polite">
        <span className="loading-spinner" aria-hidden="true" />
        Carregando dados do paciente…
      </div>
    );
  }

  if (view === 'edit-error') {
    return (
      <div className="patients-state patients-state--error" role="alert">
        <p>Não foi possível carregar os dados do paciente. {detailError}</p>
        <Button type="button" variant="quiet" onClick={() => setView('list')}>
          Voltar à lista
        </Button>
      </div>
    );
  }

  if (view === 'edit' && selectedPatient) {
    return (
      <PatientEditForm
        key={selectedPatient.id}
        patient={selectedPatient}
        accessToken={accessToken}
        onCancel={() => {
          setSelectedPatient(null);
          setView('list');
        }}
        onSaved={handlePatientSaved}
      />
    );
  }

  return (
    <section className="patients-page" aria-labelledby="patients-title">
      <header className="patients-heading">
        <div>
          <span className="eyebrow patients-eyebrow">ADMINISTRAÇÃO</span>
          <h1 id="patients-title">Pacientes</h1>
          <p>Consulte os cadastros ou adicione um novo paciente.</p>
        </div>
        <Button type="button" onClick={() => setView('form')}>
          <FiPlus aria-hidden="true" />
          Novo paciente
        </Button>
      </header>

      <div className="patients-toolbar">
        <label className="patients-search" htmlFor="patient-search">
          <FiSearch aria-hidden="true" />
          <span className="visually-hidden">Buscar pacientes por nome, e-mail ou telefone</span>
          <input
            id="patient-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por nome, e-mail ou telefone"
            maxLength={100}
          />
        </label>
        {listStatus === 'success' && (
          <span className="patients-count" aria-live="polite">
            {patients.length} {patients.length === 1 ? 'paciente' : 'pacientes'}
          </span>
        )}
      </div>

      {listStatus === 'loading' && (
        <div className="patients-state" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          Carregando pacientes…
        </div>
      )}

      {listStatus === 'error' && (
        <div className="patients-state patients-state--error" role="alert">
          <p>Não foi possível carregar a lista. {listError}</p>
          <Button
            type="button"
            variant="quiet"
            onClick={() => setReloadCount((count) => count + 1)}
          >
            Tentar novamente
          </Button>
        </div>
      )}

      {statusError && (
        <p className="patients-alert patients-alert--page" role="alert">
          {statusError}
        </p>
      )}

      {listStatus === 'success' && patients.length === 0 && (
        <div className="patients-state patients-state--empty">
          <span className="patients-empty__icon" aria-hidden="true">
            <FiUsers />
          </span>
          <h2>{search ? 'Nenhum resultado encontrado' : 'Nenhum paciente cadastrado'}</h2>
          <p>
            {search
              ? 'Tente buscar usando outro nome, e-mail ou telefone.'
              : 'Quando você adicionar pacientes, eles aparecerão nesta lista.'}
          </p>
        </div>
      )}

      {listStatus === 'success' && patients.length > 0 && (
        <div
          className={`patients-table-wrap${openPatientMenuId ? ' patients-table-wrap--menu-open' : ''}`}
        >
          <table className="patients-table">
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">E-mail</th>
                <th scope="col">Telefone</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="visually-hidden">Acesso às dietas</span></th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => (
                <tr key={patient.id}>
                  <th scope="row" data-label="Nome">
                    <div className="patient-name">
                      <span>{patient.full_name}</span>
                      <div
                        className="patient-menu"
                        ref={openPatientMenuId === patient.id ? patientMenuRef : null}
                      >
                        <Button
                          type="button"
                          variant="quiet"
                          className="patient-menu__toggle"
                          aria-label={`Opções de ${patient.full_name}`}
                          aria-expanded={openPatientMenuId === patient.id}
                          aria-controls={openPatientMenuId === patient.id
                            ? `patient-menu-${patient.id}`
                            : undefined}
                          onClick={() => setOpenPatientMenuId((current) =>
                            current === patient.id ? '' : patient.id)}
                        >
                          <FiSettings aria-hidden="true" />
                        </Button>
                        {openPatientMenuId === patient.id && (
                          <div
                            className="patient-menu__popover"
                            id={`patient-menu-${patient.id}`}
                            role="group"
                            aria-label={`Opções de ${patient.full_name}`}
                          >
                            <Button
                              type="button"
                              variant="quiet"
                              onClick={() => {
                                setOpenPatientMenuId('');
                                openPatient(patient);
                              }}
                            >
                              Editar
                            </Button>
                            <Button
                              type="button"
                              variant="quiet"
                              onClick={() => {
                                setOpenPatientMenuId('');
                                handleStatusChange(patient);
                              }}
                              disabled={changingStatusId === patient.id}
                            >
                              {changingStatusId === patient.id
                                ? 'Atualizando…'
                                : patient.is_active ? 'Desativar' : 'Ativar'}
                            </Button>
                            <Button
                              type="button"
                              variant="quiet"
                              onClick={() => {
                                setOpenPatientMenuId('');
                                handlePasswordReset(patient);
                              }}
                              disabled={changingStatusId === patient.id || !patient.is_active}
                            >
                              {changingStatusId === patient.id
                                ? 'Aguarde…'
                                : 'Redefinir senha'}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                  <td data-label="E-mail">
                    {patient.email ? (
                      <a href={`mailto:${patient.email}`}>{patient.email}</a>
                    ) : '—'}
                  </td>
                  <td data-label="Telefone">
                    {patient.phone && whatsappUrl(patient.phone) ? (
                      <a
                        href={whatsappUrl(patient.phone)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Abrir WhatsApp de ${patient.full_name}`}
                      >
                        {patient.phone}
                      </a>
                    ) : patient.phone || '—'}
                  </td>
                  <td data-label="Status">
                    <span
                      className={`patient-status${patient.is_active ? '' : ' patient-status--inactive'}`}
                    >
                      {patient.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="patient-actions">
                    <a
                      className="button button--quiet"
                      href={`/nutritionist/patients/${encodeURIComponent(patient.id)}/diets`}
                      aria-label={`Dietas de ${patient.full_name}`}
                    >
                      Dietas
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
