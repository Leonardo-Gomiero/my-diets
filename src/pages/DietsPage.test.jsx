// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  activateDiet,
  deleteDiet,
  duplicateDiet,
  getDietHistory,
} from '../services/dietService.js';
import DietsPage from './DietsPage.jsx';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/dietService.js', () => ({
  activateDiet: vi.fn(),
  deleteDiet: vi.fn(),
  duplicateDiet: vi.fn(),
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

function renderDiets() {
  return render(
    <MemoryRouter initialEntries={['/nutritionist/patients/patient-1/diets']}>
      <Routes>
        <Route path="/nutritionist/patients/:patientId/diets" element={<DietsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuth.mockReturnValue({ session: { access_token: 'admin-token' } });
  getDietHistory.mockReset();
  activateDiet.mockReset();
  deleteDiet.mockReset();
  duplicateDiet.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DietsPage', () => {
  it('shows status and edit, activate, duplicate, and delete actions', async () => {
    let finish;
    getDietHistory.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderDiets();
    expect(screen.getByRole('status').textContent).toContain('Carregando dietas');
    finish([archived, draft, active]);

    expect(await screen.findByText('Rascunho')).toBeTruthy();
    expect(screen.getByText('Ativa')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Dietas' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Plano novo' })).toBeTruthy();
    expect(screen.getByText('Arquivada')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Editar versão 1' }).getAttribute('href'))
      .toBe('/nutritionist/patients/patient-1/diets/diet-1/edit');
    expect(screen.getByRole('link', { name: 'Editar versão 2' }).getAttribute('href'))
      .toBe('/nutritionist/patients/patient-1/diets/diet-2/edit');
    expect(screen.getByRole('button', { name: 'Ativar versão 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ativar versão 3' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Versão 1 ativada' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Versão 1 ativada' }).textContent).toBe('Ativado');
    expect(screen.getAllByRole('button', { name: /^Ativar versão/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Duplicar versão/ })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /^Excluir versão/ })).toHaveLength(3);
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
    renderDiets();
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar versão 3' }));

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
    renderDiets();
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
    renderDiets();
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar versão 2' }));
    expect(activateDiet).not.toHaveBeenCalled();
  });

  it('shows activation errors and preserves the displayed old active version', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    getDietHistory.mockResolvedValue([draft, active]);
    activateDiet.mockRejectedValue(
      new Error('Não foi possível confirmar a ativação. Atualize o histórico antes de tentar novamente.'),
    );
    renderDiets();
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar versão 2' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Atualize o histórico antes de tentar novamente.',
    );
    expect(screen.getByText('Ativa')).toBeTruthy();
    await waitFor(() => expect(getDietHistory).toHaveBeenCalledTimes(2));
  });

  it('shows diet loading errors with a retry action', async () => {
    getDietHistory
      .mockRejectedValueOnce(new Error('Dietas indisponíveis.'))
      .mockResolvedValueOnce([]);
    renderDiets();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Dietas indisponíveis.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('heading', { name: 'Nenhuma dieta cadastrada' }))
      .toBeTruthy();
  });

  it('keeps new diet creation accessible from the diets page', async () => {
    getDietHistory.mockResolvedValue([]);
    renderDiets();

    const newDietLink = await screen.findByRole('link', { name: 'Nova dieta' });
    expect(newDietLink.getAttribute('href')).toBe('/nutritionist/patients/patient-1/diet');
  });

  it('duplicates a diet as a draft and reloads the history', async () => {
    const copy = { ...draft, id: 'diet-copy', version: 4 };
    getDietHistory.mockResolvedValueOnce([active]).mockResolvedValueOnce([copy, active]);
    duplicateDiet.mockResolvedValue(copy);
    renderDiets();
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicar versão 1' }));

    expect(duplicateDiet).toHaveBeenCalledWith('diet-1', { accessToken: 'admin-token' });
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Versão 4 criada como rascunho. Ative-a quando quiser disponibilizá-la ao paciente.',
    );
    expect(await screen.findByRole('heading', { name: 'Plano novo' })).toBeTruthy();
    await waitFor(() => expect(getDietHistory).toHaveBeenCalledTimes(2));
  });

  it('confirms and deletes an active diet with an explicit warning', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    getDietHistory.mockResolvedValueOnce([active]).mockResolvedValueOnce([]);
    deleteDiet.mockResolvedValue(undefined);
    renderDiets();
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir versão 1' }));

    expect(confirm).toHaveBeenCalledWith(
      'Excluir permanentemente "Plano atual" (versão 1)? Esta ação não pode ser desfeita. Esta dieta está ativa e o paciente ficará sem uma dieta ativa.',
    );
    expect(deleteDiet).toHaveBeenCalledWith('diet-1', { accessToken: 'admin-token' });
    expect(await screen.findByRole('heading', { name: 'Nenhuma dieta cadastrada' })).toBeTruthy();
  });

  it('does not delete a diet after cancellation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    getDietHistory.mockResolvedValue([active]);
    renderDiets();
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir versão 1' }));
    expect(deleteDiet).not.toHaveBeenCalled();
  });
});
