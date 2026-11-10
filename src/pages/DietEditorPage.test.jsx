// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { createDiet, getDiet, updateDiet } from '../services/dietService.js';
import DietEditorPage from './DietEditorPage.jsx';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/dietService.js', () => ({
  createDiet: vi.fn(),
  getDiet: vi.fn(),
  updateDiet: vi.fn(),
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

const activeDiet = {
  id: 'diet-existing',
  student_id: 'patient-1',
  title: 'Plano existente',
  version: 4,
  status: 'ACTIVE',
  target_calories: 1800,
  target_protein: null,
  target_carbohydrates: null,
  target_fats: null,
  notes: 'Notas',
  meals: [{
    id: 'meal-1',
    order_index: 0,
    name: 'Café da manhã',
    scheduled_time: '08:00:00',
    target_calories: null,
    notes: null,
    food_groups: [{
      id: 'group-1',
      order_index: 0,
      name: 'Proteínas',
      food_options: [{
        id: 'option-1',
        order_index: 0,
        label: 'Opção A',
        food_name: 'Ovos',
        quantity: 2,
        unit: 'unidades',
        calories: 140,
        protein: 12,
        carbohydrates: null,
        fats: null,
        notes: null,
      }],
    }],
  }],
};

function renderEditor(path = '/nutritionist/patients/patient-1/diet') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/nutritionist/patients/:patientId/diet" element={<DietEditorPage />} />
        <Route
          path="/nutritionist/patients/:patientId/diets/:dietId/edit"
          element={<DietEditorPage />}
        />
        <Route
          path="/nutritionist/patients/:patientId/diets"
          element={<CurrentPath />}
        />
        <Route path="/nutritionist" element={<CurrentPath />} />
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
  createDiet.mockReset();
  getDiet.mockReset();
  updateDiet.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DietEditorPage', () => {
  it('validates required fields before making a request', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByRole('alert').textContent).toContain(
      'Informe um título com até 200 caracteres.',
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Informe uma quantidade não negativa para a opção 1.1.1.',
    );
    expect(createDiet).not.toHaveBeenCalled();
  });

  it('creates an active diet and saves subsequent edits without activating them', async () => {
    const activeSavedDiet = { ...savedDraft, status: 'ACTIVE' };
    createDiet.mockResolvedValue(activeSavedDiet);
    updateDiet.mockResolvedValue(savedDraft);
    renderEditor();
    fillMinimumDiet();
    fireEvent.change(screen.getByLabelText('Calorias (kcal)'), {
      target: { value: '1800' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Dieta v1 criada e ativada.',
    );
    expect(createDiet).toHaveBeenCalledWith(
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
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(updateDiet).toHaveBeenCalledWith(
      'diet-1',
      expect.objectContaining({ title: 'Plano individual atualizado' }),
      { accessToken: 'admin-token' },
    ));
    expect((await screen.findByRole('status')).textContent).toContain(
      'Edição salva como versão 1. Ative-a na página de Dietas quando quiser disponibilizá-la ao paciente.',
    );
  });

  it('loads an active existing diet and saves the edit as a draft version', async () => {
    getDiet.mockResolvedValue(activeDiet);
    updateDiet.mockResolvedValue({
      id: 'diet-new',
      student_id: 'patient-1',
      version: 5,
      status: 'DRAFT',
    });
    renderEditor('/nutritionist/patients/patient-1/diets/diet-existing/edit');

    expect(await screen.findByRole('heading', { name: 'Editar dieta' })).toBeTruthy();
    expect(screen.getByLabelText('Título da dieta').value).toBe('Plano existente');
    expect(screen.getByLabelText('Nome da refeição').value).toBe('Café da manhã');
    expect(screen.getByLabelText('Alimento').value).toBe('Ovos');
    expect(screen.getByText('Ativa · v4')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Título da dieta'), {
      target: { value: 'Plano atualizado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Edição salva como versão 5. Ative-a na página de Dietas quando quiser disponibilizá-la ao paciente.',
    );
    expect(updateDiet).toHaveBeenCalledWith(
      'diet-existing',
      expect.objectContaining({ title: 'Plano atualizado' }),
      { accessToken: 'admin-token' },
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
    createDiet.mockRejectedValue(new Error('Não foi possível salvar.'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderEditor();
    fillMinimumDiet();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
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
    expect((await screen.findByTestId('current-path')).textContent)
      .toBe('/nutritionist/patients/patient-1/diets');
  });
});
