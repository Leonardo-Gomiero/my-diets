import { useState } from 'react';
import { FiArrowLeft } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { updateNutritionistProfile } from '../services/nutritionistService.js';
import './NutritionistProfilePage.css';

const MAX_NAME_LENGTH = 200;
const MAX_PHONE_LENGTH = 32;

export default function NutritionistProfilePage() {
  const { session, profile, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSaved(false);

    if (!fullName.trim() || fullName.trim().length > MAX_NAME_LENGTH) {
      setError('Informe seu nome completo (até 200 caracteres).');
      return;
    }

    const phone = whatsapp.trim();
    const digits = phone.replace(/\D/g, '');
    if (phone.length > MAX_PHONE_LENGTH || (phone && (digits.length < 8 || digits.length > 15))) {
      setError('Informe um WhatsApp válido, incluindo código do país e DDD.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateNutritionistProfile(
        {
          full_name: fullName.trim(),
          whatsapp: phone || null,
        },
        { accessToken: session?.access_token },
      );
      updateProfile(updated);
      setFullName(updated.full_name);
      setWhatsapp(updated.whatsapp ?? '');
      setSaved(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="nutritionist-profile" aria-labelledby="nutritionist-profile-title">
      <Link className="nutritionist-profile__back" to="/nutritionist">
        <FiArrowLeft aria-hidden="true" />
        Voltar aos pacientes
      </Link>
      <header className="nutritionist-profile__heading">
        <span className="eyebrow">CONFIGURAÇÕES DA CONTA</span>
        <h1 id="nutritionist-profile-title">Meu perfil</h1>
        <p>Essas informações ajudam seus pacientes a identificar e contatar você.</p>
      </header>

      <form className="nutritionist-profile__form" onSubmit={handleSubmit} noValidate>
        {error && <p className="nutritionist-profile__alert" role="alert">{error}</p>}
        {saved && (
          <p className="nutritionist-profile__success" role="status">
            Perfil atualizado.
          </p>
        )}

        <label htmlFor="nutritionist-full-name">
          Nome completo
          <input
            id="nutritionist-full-name"
            autoComplete="name"
            maxLength={MAX_NAME_LENGTH}
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>

        <label htmlFor="nutritionist-whatsapp">
          WhatsApp <span>(opcional)</span>
          <input
            id="nutritionist-whatsapp"
            type="tel"
            autoComplete="tel"
            maxLength={MAX_PHONE_LENGTH}
            placeholder="+55 (11) 99999-9999"
            value={whatsapp}
            onChange={(event) => setWhatsapp(event.target.value)}
          />
          <small>Pacientes poderão iniciar uma conversa pelo link no portal.</small>
        </label>

        <div className="nutritionist-profile__actions">
          <Button type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar perfil'}
          </Button>
        </div>
      </form>
    </section>
  );
}
