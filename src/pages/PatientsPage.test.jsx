// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../context/AuthContext.jsx';
import { createPatient, getPatients } from '../services/patientService.js';
import PatientsPage from './PatientsPage.jsx';

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../services/patientService.js', () => ({
  createPatient: vi.fn(),
  getPatients: vi.fn(),
}));

const samplePatient = {
  id: 'patient-1',
  full_name: 'Ana Exemplo',
  email: 'ana@example.test',
  phone: null,
  is_active: true,
};

beforeEach(() => {
  getPatients.mockReset();
  useAuth.mockReturnValue({
    session: { access_token: 'admin-access-token' },
  });
  getPatients.mockResolvedValue([]);
  createPatient.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PatientsPage', () => {
  it('shows loading and empty list states in Brazilian Portuguese', async () => {
    let finishLoading;
    getPatients.mockReturnValue(
      new Promise((resolve) => {
        finishLoading = resolve;
      }),
    );

    render(<PatientsPage />);
    expect(screen.getByRole('status').textContent).toContain('Carregando pacientes');
    await act(async () => finishLoading([]));
    expect(await screen.findByRole('heading', { name: 'Nenhum paciente cadastrado' }))
      .toBeTruthy();
  });

  it('loads patients and sends search terms to the server API', async () => {
    getPatients.mockResolvedValue([samplePatient]);
    render(<PatientsPage />);

    expect(await screen.findByText('ana@example.test')).toBeTruthy();
    expect(getPatients).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'admin-access-token', search: '' }),
    );

    fireEvent.change(
      screen.getByRole('searchbox', {
        name: 'Buscar pacientes por nome, e-mail ou telefone',
      }),
      { target: { value: 'ana@example.test' } },
    );

    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 300)));
    await waitFor(() =>
      expect(getPatients).toHaveBeenLastCalledWith(
        expect.objectContaining({
          accessToken: 'admin-access-token',
          search: 'ana@example.test',
        }),
      ),
    );
  });

  it('shows API load errors and retries without treating them as empty results', async () => {
    getPatients
      .mockRejectedValueOnce(new Error('A lista está indisponível.'))
      .mockResolvedValueOnce([]);

    render(<PatientsPage />);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'A lista está indisponível.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('heading', { name: 'Nenhum paciente cadastrado' }))
      .toBeTruthy();
    expect(getPatients).toHaveBeenCalledTimes(2);
  });

  it('validates required name and email before sending a create request', async () => {
    render(<PatientsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Novo paciente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar paciente' }));

    expect(await screen.findByText('Informe o nome completo (até 200 caracteres).'))
      .toBeTruthy();
    expect(screen.getByText('Informe um e-mail válido.')).toBeTruthy();
    expect(createPatient).not.toHaveBeenCalled();
  });

  it('shows API validation errors in the creation form', async () => {
    createPatient.mockRejectedValue(new Error('Este e-mail já está cadastrado.'));
    render(<PatientsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Novo paciente' }));
    fireEvent.change(screen.getByLabelText('Nome completo'), {
      target: { value: 'Ana Exemplo' },
    });
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'ANA@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar paciente' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Este e-mail já está cadastrado.',
    );
    expect(createPatient).toHaveBeenCalledWith(
      {
        full_name: 'Ana Exemplo',
        email: 'ana@example.test',
      },
      { accessToken: 'admin-access-token' },
    );
  });

  it('shows a one-time password, copies it, and discards it when closing', async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    createPatient.mockResolvedValue({
      patient: samplePatient,
      temporary_password: 'one-time-password-only',
    });
    getPatients.mockResolvedValue([]);
    render(<PatientsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Novo paciente' }));
    fireEvent.change(screen.getByLabelText('Nome completo'), {
      target: { value: 'Ana Exemplo' },
    });
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'ana@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar paciente' }));

    expect(await screen.findByLabelText('Senha temporária'))
      .toHaveProperty('textContent', 'one-time-password-only');
    expect(screen.getByText(/só aparece nesta tela/)).toBeTruthy();
    expect(storageWrite).not.toHaveBeenCalled();
    expect(window.location.search).not.toContain('one-time-password-only');

    fireEvent.click(screen.getByRole('button', { name: 'Copiar senha' }));
    expect((await screen.findByRole('status')).textContent).toContain('Senha copiada.');
    expect(clipboardWrite).toHaveBeenCalledWith('one-time-password-only');

    fireEvent.click(screen.getByRole('button', { name: 'Voltar à lista' }));
    await waitFor(() => {
      expect(screen.queryByText('one-time-password-only')).toBeNull();
      expect(getPatients).toHaveBeenCalledTimes(2);
    });
  });
});
