import { useEffect, useState } from 'react';
import {
  FiCheck,
  FiCopy,
  FiEdit2,
  FiKey,
  FiPlus,
  FiSearch,
  FiUser,
  FiUserX,
} from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  createNutritionist,
  getNutritionists,
  resetNutritionistPassword,
  setNutritionistActive,
  updateAdminLogin as saveAdminLogin,
  updateNutritionist,
} from '../services/adminService.js';
import './AdminNutritionistsPage.css';

const EMPTY_FORM = { full_name: '', email: '', phone: '' };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateNutritionist(form) {
  const errors = {};
  const fullName = form.full_name.trim();
  const email = form.email.trim();
  const digits = form.phone.replace(/\D/g, '');

  if (!fullName || fullName.length > 200) {
    errors.full_name = 'Informe o nome completo (até 200 caracteres).';
  }
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Informe um e-mail válido.';
  }
  if (form.phone.length > 32 || (form.phone && (digits.length < 8 || digits.length > 15))) {
    errors.phone = 'Informe um WhatsApp válido, incluindo DDD.';
  }
  return errors;
}

function NutritionistForm({ nutritionist, accessToken, onCancel, onSaved }) {
  const [form, setForm] = useState(
    nutritionist
      ? {
          full_name: nutritionist.full_name,
          email: nutritionist.email,
          phone: nutritionist.phone ?? '',
        }
      : EMPTY_FORM,
  );
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: '' }));
    setFormError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validateNutritionist(form);
    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
      };
      const result = nutritionist
        ? await updateNutritionist(nutritionist.id, payload, { accessToken })
        : await createNutritionist(payload, { accessToken });
      onSaved(result);
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-panel admin-nutritionist-form">
      <div className="admin-panel__heading">
        <span className="admin-eyebrow">{nutritionist ? 'EDITAR CADASTRO' : 'NOVO CADASTRO'}</span>
        <h2>{nutritionist ? 'Editar nutricionista' : 'Adicionar nutricionista'}</h2>
        <p>O acesso será criado com uma senha temporária e troca obrigatória.</p>
      </div>
      <form className="admin-form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="nutritionist-name">
          Nome completo
          <input
            id="nutritionist-name"
            name="full_name"
            autoComplete="name"
            autoFocus
            maxLength={200}
            required
            value={form.full_name}
            onChange={updateField}
            aria-invalid={Boolean(errors.full_name)}
          />
          {errors.full_name && <small className="admin-field-error">{errors.full_name}</small>}
        </label>
        <label htmlFor="nutritionist-email">
          E-mail de acesso
          <input
            id="nutritionist-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            value={form.email}
            onChange={updateField}
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email && <small className="admin-field-error">{errors.email}</small>}
        </label>
        <label htmlFor="nutritionist-phone">
          WhatsApp <span>(opcional)</span>
          <input
            id="nutritionist-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={32}
            placeholder="+55 (11) 99999-9999"
            value={form.phone}
            onChange={updateField}
            aria-invalid={Boolean(errors.phone)}
          />
          {errors.phone && <small className="admin-field-error">{errors.phone}</small>}
        </label>
        {formError && <p className="admin-alert" role="alert">{formError}</p>}
        <div className="admin-form__actions">
          <Button type="button" variant="quiet" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Salvando…' : nutritionist ? 'Salvar alterações' : 'Criar acesso'}
          </Button>
        </div>
      </form>
    </section>
  );
}

export default function AdminNutritionistsPage() {
  const { session, profile, updateAdminLogin } = useAuth();
  const [nutritionists, setNutritionists] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [loginValue, setLoginValue] = useState(profile?.admin_login ?? '');
  const [loginError, setLoginError] = useState('');
  const [loginSaved, setLoginSaved] = useState(false);
  const [savingLogin, setSavingLogin] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [credentialRecipient, setCredentialRecipient] = useState('');
  const [credentialPurpose, setCredentialPurpose] = useState('created');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setPageError('');
      try {
        const result = await getNutritionists({
          search,
          accessToken: session?.access_token,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setNutritionists(result);
      } catch (error) {
        if (!controller.signal.aborted) setPageError(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, search ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, session?.access_token]);

  async function handleSaved(result) {
    setShowForm(false);
    setEditing(null);
    if (result.temporary_password) {
      setTemporaryPassword(result.temporary_password);
      setCredentialRecipient(result.nutritionist.full_name);
      setCredentialPurpose('created');
      setCopied(false);
    }
    try {
      setNutritionists(
        await getNutritionists({
          search,
          accessToken: session?.access_token,
        }),
      );
    } catch (error) {
      setPageError(error.message);
    }
  }

  async function toggleActive(nutritionist) {
    const nextActive = !nutritionist.is_active;
    if (
      !nextActive &&
      !window.confirm(
        `Desativar ${nutritionist.full_name}? O login será bloqueado, mas pacientes e dietas serão mantidos; o acesso poderá ser reativado depois.`,
      )
    ) {
      return;
    }

    setBusyId(nutritionist.id);
    setPageError('');
    try {
      await setNutritionistActive(nutritionist.id, nextActive, {
        accessToken: session?.access_token,
      });
      setNutritionists((current) =>
        current.map((item) =>
          item.id === nutritionist.id ? { ...item, is_active: nextActive } : item,
        ),
      );
    } catch (error) {
      setPageError(error.message);
    } finally {
      setBusyId('');
    }
  }

  async function restoreNutritionistPassword(nutritionist) {
    if (
      !window.confirm(
        `Gerar uma nova senha temporária para ${nutritionist.full_name}? A senha atual deixará de funcionar e o nutricionista precisará criar uma nova senha no próximo acesso.`,
      )
    ) {
      return;
    }

    setBusyId(nutritionist.id);
    setPageError('');
    setTemporaryPassword('');
    try {
      const result = await resetNutritionistPassword(nutritionist.id, {
        accessToken: session?.access_token,
      });
      setTemporaryPassword(result.temporary_password);
      setCredentialRecipient(result.nutritionist.full_name);
      setCredentialPurpose('reset');
      setCopied(false);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setBusyId('');
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setLoginError('');
    setLoginSaved(false);
    setSavingLogin(true);
    try {
      const savedLogin = await saveAdminLogin(loginValue.trim(), {
        accessToken: session?.access_token,
      });
      updateAdminLogin(savedLogin);
      setLoginValue(savedLogin);
      setLoginSaved(true);
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setSavingLogin(false);
    }
  }

  async function copyTemporaryPassword() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    } catch {
      setPageError('Não foi possível copiar. Selecione e copie a senha exibida.');
    }
  }

  return (
    <section className="admin-page" aria-labelledby="admin-title">
      <header className="admin-heading">
        <div>
          <span className="admin-eyebrow">ADMINISTRAÇÃO</span>
          <h1 id="admin-title">Nutricionistas</h1>
          <p>Gerencie os acessos e os dados dos profissionais da plataforma.</p>
        </div>
        {!showForm && (
          <Button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
              setTemporaryPassword('');
            }}
          >
            <FiPlus aria-hidden="true" />
            Novo nutricionista
          </Button>
        )}
      </header>

      {showForm && (
        <NutritionistForm
          nutritionist={editing}
          accessToken={session?.access_token}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={handleSaved}
        />
      )}

      <section className="admin-panel admin-account-panel" aria-labelledby="admin-account-title">
        <div className="admin-account-panel__intro">
          <span className="admin-eyebrow">SUA CONTA</span>
          <h2 id="admin-account-title">Login do administrador</h2>
          <p>Use este login junto à sua senha para acessar a área administrativa.</p>
        </div>
        <form className="admin-login-form" onSubmit={handleLoginSubmit}>
          <label htmlFor="admin-login">
            Login
            <input
              id="admin-login"
              name="login"
              autoComplete="username"
              minLength={3}
              maxLength={32}
              required
              value={loginValue}
              onChange={(event) => {
                setLoginValue(event.target.value);
                setLoginError('');
                setLoginSaved(false);
              }}
            />
          </label>
          <Button type="submit" disabled={savingLogin}>
            {savingLogin ? 'Salvando…' : 'Alterar login'}
          </Button>
          {loginError && <p className="admin-alert" role="alert">{loginError}</p>}
          {loginSaved && <p className="admin-success" role="status">Login atualizado.</p>}
        </form>
      </section>

      {temporaryPassword && (
        <section className="admin-credential" aria-live="polite">
          <div>
            <span className="admin-eyebrow">
              {credentialPurpose === 'reset' ? 'SENHA RESTAURADA' : 'ACESSO CRIADO'}
            </span>
            <h2>
              Senha temporária de {credentialRecipient}
            </h2>
            <p>
              Exibida somente agora. O nutricionista deverá criar uma nova senha
              {credentialPurpose === 'reset' ? ' no próximo acesso.' : ' no primeiro acesso.'}
            </p>
          </div>
          <code>{temporaryPassword}</code>
          <Button type="button" variant="quiet" onClick={copyTemporaryPassword}>
            {copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
            {copied ? 'Copiada' : 'Copiar senha'}
          </Button>
          <button
            className="admin-credential__dismiss"
            type="button"
            onClick={() => {
              setTemporaryPassword('');
              setCredentialRecipient('');
            }}
          >
            Fechar
          </button>
        </section>
      )}

      {pageError && <p className="admin-alert" role="alert">{pageError}</p>}
      <section className="admin-list" aria-label="Lista de nutricionistas">
        <div className="admin-toolbar">
          <label className="admin-search">
            <FiSearch aria-hidden="true" />
            <span className="sr-only">Buscar nutricionistas</span>
            <input
              type="search"
              placeholder="Buscar por nome, e-mail ou WhatsApp"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <span className="admin-count">
            {nutritionists.length} {nutritionists.length === 1 ? 'nutricionista' : 'nutricionistas'}
          </span>
        </div>

        {loading ? (
          <p className="admin-state" role="status">Carregando nutricionistas…</p>
        ) : nutritionists.length === 0 ? (
          <p className="admin-state">
            {search ? 'Nenhum nutricionista encontrado.' : 'Nenhum nutricionista cadastrado ainda.'}
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">E-mail</th>
                  <th scope="col">WhatsApp</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {nutritionists.map((nutritionist) => (
                  <tr key={nutritionist.id}>
                    <th scope="row">
                      <span className="admin-name">
                        <FiUser aria-hidden="true" />
                        {nutritionist.full_name}
                      </span>
                    </th>
                    <td data-label="E-mail">{nutritionist.email}</td>
                    <td data-label="WhatsApp">{nutritionist.phone || '—'}</td>
                    <td data-label="Status">
                      <span
                        className={`admin-status ${nutritionist.is_active ? 'admin-status--active' : 'admin-status--inactive'}`}
                      >
                        {nutritionist.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td data-label="">
                      <div className="admin-row-actions">
                        <Button
                          type="button"
                          variant="quiet"
                          onClick={() => {
                            setEditing(nutritionist);
                            setShowForm(true);
                            setTemporaryPassword('');
                          }}
                          aria-label={`Editar ${nutritionist.full_name}`}
                        >
                          <FiEdit2 aria-hidden="true" />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="quiet"
                          disabled={
                            busyId === nutritionist.id || !nutritionist.is_active
                          }
                          onClick={() => restoreNutritionistPassword(nutritionist)}
                          aria-label={`Restaurar senha de ${nutritionist.full_name}`}
                          title={
                            nutritionist.is_active
                              ? 'Gerar nova senha temporária'
                              : 'Reative o nutricionista para restaurar a senha'
                          }
                        >
                          <FiKey aria-hidden="true" />
                          {busyId === nutritionist.id
                            ? 'Salvando…'
                            : 'Restaurar senha'}
                        </Button>
                        <Button
                          type="button"
                          variant="quiet"
                          disabled={busyId === nutritionist.id}
                          onClick={() => toggleActive(nutritionist)}
                          aria-label={`${nutritionist.is_active ? 'Desativar' : 'Reativar'} ${nutritionist.full_name}`}
                        >
                          <FiUserX aria-hidden="true" />
                          {busyId === nutritionist.id
                            ? 'Salvando…'
                            : nutritionist.is_active
                              ? 'Desativar'
                              : 'Reativar'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
