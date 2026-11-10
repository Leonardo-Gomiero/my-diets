import { useEffect, useState } from 'react';
import { FiArrowLeft, FiCopy, FiPlus, FiSearch, FiUsers } from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { createPatient, getPatients } from '../services/patientService.js';
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

function TemporaryPassword({ patient, password, onClose }) {
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
      <h1 id="password-result-title">Cadastro concluído</h1>
      <p className="password-result__patient">
        A senha temporária de <strong>{patient.full_name}</strong> só aparece nesta tela.
      </p>
      <div className="password-result__warning" role="note">
        Anote ou compartilhe esta senha agora. Ao sair desta tela, ela será descartada e
        não poderá ser consultada novamente.
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
    setView('password');
  }

  function discardTemporaryPassword() {
    setTemporaryPassword('');
    setCreatedPatient(null);
    setView('list');
    setReloadCount((count) => count + 1);
  }

  if (view === 'password' && createdPatient && temporaryPassword) {
    return (
      <TemporaryPassword
        patient={createdPatient}
        password={temporaryPassword}
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
        <div className="patients-table-wrap">
          <table className="patients-table">
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">E-mail</th>
                <th scope="col">Telefone</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => (
                <tr key={patient.id}>
                  <th scope="row" data-label="Nome">{patient.full_name}</th>
                  <td data-label="E-mail">{patient.email || '—'}</td>
                  <td data-label="Telefone">{patient.phone || '—'}</td>
                  <td data-label="Status">
                    <span
                      className={`patient-status${patient.is_active ? '' : ' patient-status--inactive'}`}
                    >
                      {patient.is_active ? 'Ativo' : 'Inativo'}
                    </span>
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
