// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { createDietDraft, updateDietDraft } from '../services/dietService.js';
import DietEditorPage from './DietEditorPage.jsx';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/dietService.js', () => ({
  createDietDraft: vi.fn(),
  updateDietDraft: vi.fn(),
}));

const savedDraft = {
  id: 'diet-1',
  student_id: 'patient-1',
  version: 1,
  status: 'DRAFT',
};

function CurrentPath() {
  const location = useLocation();
  return <p data-testid="current-path">{location.pathname}</p>;
}

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/admin/patients/patient-1/diet']}>
      <Routes>
        <Route path="/admin/patients/:patientId/diet" element={<DietEditorPage />} />
        <Route path="/admin" element={<CurrentPath />} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillMinimumDiet() {
  fireEvent.change(screen.getByLabelText('Título da dieta'), {
    target: { value: 'Plano individual' },
  });
  fireEvent.change(screen.getByLabelText('Nome da refeição'), {
    target: { value: 'Café da manhã' },
  });
  fireEvent.change(screen.getByLabelText('Nome do grupo'), {
    target: { value: 'Proteínas' },
  });
  fireEvent.change(screen.getByLabelText('Identificação'), {
    target: { value: 'Opção A' },
  });
  fireEvent.change(screen.getByLabelText('Alimento'), {
    target: { value: 'Ovos' },
  });
  fireEvent.change(screen.getByLabelText('Quantidade'), {
    target: { value: '2' },
  });
  fireEvent.change(screen.getByLabelText('Unidade'), {
    target: { value: 'unidades' },
  });
}

beforeEach(() => {
  useAuth.mockReturnValue({ session: { access_token: 'admin-token' } });
  createDietDraft.mockReset();
  updateDietDraft.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DietEditorPage', () => {
  it('validates required fields before making a request', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));

    expect(screen.getByRole('alert').textContent).toContain(
      'Informe um título com até 200 caracteres.',
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Informe uma quantidade não negativa para a opção 1.1.1.',
    );
    expect(createDietDraft).not.toHaveBeenCalled();
  });

  it('creates a nested draft and then updates it without leaving the editor', async () => {
    createDietDraft.mockResolvedValue(savedDraft);
    updateDietDraft.mockResolvedValue(savedDraft);
    renderEditor();
    fillMinimumDiet();
    fireEvent.change(screen.getByLabelText('Calorias (kcal)'), {
      target: { value: '1800' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));

    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Rascunho v1 criado. Você pode continuar editando e salvar novas alterações.',
    );
    expect(createDietDraft).toHaveBeenCalledWith(
      'patient-1',
      expect.objectContaining({
        title: 'Plano individual',
        target_calories: 1800,
        meals: [
          expect.objectContaining({
            name: 'Café da manhã',
            food_groups: [
              expect.objectContaining({
                name: 'Proteínas',
                options: [
                  expect.objectContaining({
                    label: 'Opção A',
                    food_name: 'Ovos',
                    quantity: 2,
                    unit: 'unidades',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      { accessToken: 'admin-token' },
    );

    fireEvent.change(screen.getByLabelText('Título da dieta'), {
      target: { value: 'Plano individual atualizado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(updateDietDraft).toHaveBeenCalledWith(
      'diet-1',
      expect.objectContaining({ title: 'Plano individual atualizado' }),
      { accessToken: 'admin-token' },
    ));
    expect((await screen.findByRole('status')).textContent).toContain(
      'Alterações do rascunho salvas.',
    );
  });

  it('adds, removes, and reorders nested rows', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar refeição' }));
    fireEvent.change(document.getElementById('meal-1-name'), {
      target: { value: 'Almoço' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mover refeição 2 para cima' }));
    expect(document.getElementById('meal-0-name').value)
      .toBe('Almoço');
    expect(document.getElementById('meal-1-name').value)
      .toBe('');

    fireEvent.click(screen.getAllByRole('button', { name: 'Adicionar grupo' })[0]);
    expect(screen.getByText('Grupo 1.2')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Adicionar opção' })[0]);
    expect(screen.getByRole('heading', { name: 'Opção 2' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remover opção 2 do grupo 1' }));
    expect(screen.queryByRole('heading', { name: 'Opção 2' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remover grupo 2 da refeição 1' }));
    expect(screen.queryByText('Grupo 1.2')).toBeNull();
  });

  it('shows API errors and warns before leaving with unsaved changes', async () => {
    createDietDraft.mockRejectedValue(new Error('Não foi possível salvar.'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderEditor();
    fillMinimumDiet();
    fireEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Não foi possível salvar.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sair do editor' }));
    expect(confirm).toHaveBeenCalledWith(
      'Há alterações não salvas. Deseja sair e descartá-las?',
    );
    expect(screen.getByRole('heading', { name: 'Nova dieta' })).toBeTruthy();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Sair do editor' }));
    expect((await screen.findByTestId('current-path')).textContent).toContain('/admin');
  });
});
