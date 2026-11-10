// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../context/AuthContext.jsx';
import {
  createNutritionist,
  getNutritionists,
  resetNutritionistPassword,
  setNutritionistActive,
  updateAdminLogin,
  updateNutritionist,
} from '../services/adminService.js';
import AdminNutritionistsPage from './AdminNutritionistsPage.jsx';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/adminService.js', () => ({
  createNutritionist: vi.fn(),
  getNutritionists: vi.fn(),
  resetNutritionistPassword: vi.fn(),
  setNutritionistActive: vi.fn(),
  updateAdminLogin: vi.fn(),
  updateNutritionist: vi.fn(),
}));

const nutritionist = {
  id: 'nutritionist-id',
  full_name: 'Dra. Ana',
  email: 'ana@example.test',
  phone: '+55 11 99999-9999',
  is_active: true,
};

beforeEach(() => {
  useAuth.mockReturnValue({
    session: { access_token: 'admin-token' },
    profile: { role: 'SUPERADMIN', admin_login: 'admin' },
    updateAdminLogin: vi.fn(),
  });
  getNutritionists.mockReset().mockResolvedValue([]);
  createNutritionist.mockReset();
  resetNutritionistPassword.mockReset();
  updateNutritionist.mockReset();
  setNutritionistActive.mockReset();
  updateAdminLogin.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AdminNutritionistsPage', () => {
  it('creates a nutritionist and displays their one-time temporary password', async () => {
    createNutritionist.mockResolvedValue({
      nutritionist,
      temporary_password: 'temporary-password',
    });
    getNutritionists.mockResolvedValueOnce([]).mockResolvedValueOnce([nutritionist]);
    render(<AdminNutritionistsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Novo nutricionista' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Nome completo'));
    expect(
      screen.getByRole('heading', { name: 'Adicionar nutricionista' })
        .compareDocumentPosition(
          screen.getByRole('heading', { name: 'Login do administrador' }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nome completo'), {
      target: { value: 'Dra. Ana' },
    });
    fireEvent.change(screen.getByLabelText('E-mail de acesso'), {
      target: { value: 'ana@example.test' },
    });
    fireEvent.change(screen.getByLabelText('WhatsApp (opcional)'), {
      target: { value: '+55 11 99999-9999' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }));

    expect(await screen.findByText('temporary-password')).toBeTruthy();
    expect(createNutritionist).toHaveBeenCalledWith(
      {
        full_name: 'Dra. Ana',
        email: 'ana@example.test',
        phone: '+55 11 99999-9999',
      },
      { accessToken: 'admin-token' },
    );
    expect(await screen.findByText('Dra. Ana')).toBeTruthy();
  });

  it('updates the administrator login in the session after the API confirms it', async () => {
    const updateAdminLoginInContext = vi.fn();
    useAuth.mockReturnValue({
      session: { access_token: 'admin-token' },
      profile: { role: 'SUPERADMIN', admin_login: 'admin' },
      updateAdminLogin: updateAdminLoginInContext,
    });
    updateAdminLogin.mockResolvedValue('new-admin');
    render(<AdminNutritionistsPage />);

    fireEvent.change(screen.getByLabelText('Login'), {
      target: { value: 'new-admin' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Alterar login' }));

    await waitFor(() => {
      expect(updateAdminLoginInContext).toHaveBeenCalledWith('new-admin');
    });
    expect(updateAdminLogin).toHaveBeenCalledWith(
      'new-admin',
      { accessToken: 'admin-token' },
    );
    expect(screen.getByRole('status').textContent).toBe('Login atualizado.');
  });

  it('confirms a password reset and shows the one-time password', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    getNutritionists.mockResolvedValue([nutritionist]);
    resetNutritionistPassword.mockResolvedValue({
      nutritionist,
      temporary_password: 'fresh-temporary-password',
    });
    render(<AdminNutritionistsPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Restaurar senha de Dra. Ana' }),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      'Gerar uma nova senha temporária para Dra. Ana? A senha atual deixará de funcionar e o nutricionista precisará criar uma nova senha no próximo acesso.',
    );
    expect(await screen.findByText('fresh-temporary-password')).toBeTruthy();
    expect(screen.getByText('Senha temporária de Dra. Ana')).toBeTruthy();
    expect(resetNutritionistPassword).toHaveBeenCalledWith(
      nutritionist.id,
      { accessToken: 'admin-token' },
    );
  });
});
