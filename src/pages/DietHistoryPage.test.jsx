// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { activateDiet, getDietHistory } from '../services/dietService.js';
import DietHistoryPage from './DietHistoryPage.jsx';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/dietService.js', () => ({
  activateDiet: vi.fn(),
  getDietHistory: vi.fn(),
}));

const active = {
  id: 'diet-1',
  title: 'Plano atual',
  version: 1,
  status: 'ACTIVE',
  created_at: '2026-01-02T10:00:00Z',
};
const draft = {
  id: 'diet-2',
  title: 'Plano novo',
  version: 2,
  status: 'DRAFT',
  created_at: '2026-02-02T10:00:00Z',
};
const archived = {
  id: 'diet-3',
  title: 'Plano arquivado',
  version: 3,
  status: 'ARCHIVED',
  created_at: '2026-03-02T10:00:00Z',
};

function renderHistory() {
  return render(
    <MemoryRouter initialEntries={['/admin/patients/patient-1/diets']}>
      <Routes>
        <Route path="/admin/patients/:patientId/diets" element={<DietHistoryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuth.mockReturnValue({ session: { access_token: 'admin-token' } });
  getDietHistory.mockReset();
  activateDiet.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DietHistoryPage', () => {
  it('shows loading, status, version, and allows draft or archived diet activation', async () => {
    let finish;
    getDietHistory.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderHistory();
    expect(screen.getByRole('status').textContent).toContain('Carregando histórico');
    finish([archived, draft, active]);

    expect(await screen.findByText('Rascunho')).toBeTruthy();
    expect(screen.getByText('Ativa')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Plano novo' })).toBeTruthy();
    expect(screen.getByText('Arquivada')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ativar versão 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reativar versão 3' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Ativar|Reativar versão/ })).toHaveLength(2);
  });

  it('reactivates an archived diet and archives the current active version', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    getDietHistory.mockResolvedValueOnce([active, archived]).mockResolvedValueOnce([
      { ...archived, status: 'ACTIVE' },
      { ...active, status: 'ARCHIVED' },
    ]);
    activateDiet.mockResolvedValue({
      ...archived,
      status: 'ACTIVE',
      previous_active_id: active.id,
    });
    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar versão 3' }));

    expect(confirm).toHaveBeenCalledWith(
      'Ativar a versão 3? A versão ativa atual será arquivada na mesma operação.',
    );
    expect(activateDiet).toHaveBeenCalledWith(
      'patient-1',
      archived.id,
      { accessToken: 'admin-token' },
    );
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Versão 3 ativada. A versão anterior foi arquivada.',
    );
    expect(await screen.findByText('Arquivada')).toBeTruthy();
  });

  it('confirms activation, calls the API, and refreshes the active status', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    getDietHistory.mockResolvedValueOnce([draft, active]).mockResolvedValueOnce([
      { ...draft, status: 'ACTIVE' },
      { ...active, status: 'ARCHIVED' },
    ]);
    activateDiet.mockResolvedValue({ ...draft, status: 'ACTIVE' });
    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar versão 2' }));

    expect(confirm).toHaveBeenCalledWith(
      'Ativar a versão 2? A versão ativa atual será arquivada na mesma operação.',
    );
    expect(activateDiet).toHaveBeenCalledWith(
      'patient-1',
      'diet-2',
      { accessToken: 'admin-token' },
    );
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Versão 2 ativada. A versão anterior foi arquivada.',
    );
    await waitFor(() => expect(getDietHistory).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Arquivada')).toBeTruthy();
  });

  it('does not activate after cancellation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    getDietHistory.mockResolvedValue([draft]);
    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar versão 2' }));
    expect(activateDiet).not.toHaveBeenCalled();
  });

  it('shows activation errors and preserves the displayed old active version', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    getDietHistory.mockResolvedValue([draft, active]);
    activateDiet.mockRejectedValue(
      new Error('Não foi possível confirmar a ativação. Atualize o histórico antes de tentar novamente.'),
    );
    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar versão 2' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Atualize o histórico antes de tentar novamente.',
    );
    expect(screen.getByText('Ativa')).toBeTruthy();
    await waitFor(() => expect(getDietHistory).toHaveBeenCalledTimes(2));
  });

  it('shows history loading errors with a retry action', async () => {
    getDietHistory
      .mockRejectedValueOnce(new Error('Histórico indisponível.'))
      .mockResolvedValueOnce([]);
    renderHistory();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Histórico indisponível.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('heading', { name: 'Nenhuma versão de dieta' }))
      .toBeTruthy();
  });
});
