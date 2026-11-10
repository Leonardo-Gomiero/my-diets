// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../context/AuthContext.jsx';
import { getActiveDiet } from '../services/activeDietService.js';
import ActiveDietPage from './ActiveDietPage.jsx';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/activeDietService.js', () => ({ getActiveDiet: vi.fn() }));

const activeDiet = {
  id: 'diet-1',
  title: 'Plano semanal',
  version: 3,
  status: 'ACTIVE',
  target_calories: 1800,
  target_protein: 100,
  target_carbohydrates: null,
  target_fats: 60,
  notes: 'Observação geral',
  meals: [
    {
      id: 'meal-1',
      order_index: 0,
      name: 'Café da manhã',
      scheduled_time: '08:00:00',
      target_calories: null,
      notes: null,
      food_groups: [
        {
          id: 'group-1',
          order_index: 0,
          name: 'Proteínas',
          food_options: [
            {
              id: 'option-1',
              order_index: 0,
              label: 'Opção A',
              food_name: 'Ovos',
              quantity: 2,
              unit: 'unidades',
              calories: 140,
              protein: 12,
              carbohydrates: null,
              fats: 10,
              notes: 'Cozidos',
            },
          ],
        },
      ],
    },
  ],
};

beforeEach(() => {
  useAuth.mockReturnValue({
    session: { access_token: 'student-token' },
    profile: { full_name: 'Ana Exemplo', role: 'STUDENT' },
  });
  getActiveDiet.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ActiveDietPage', () => {
  it('shows loading and then the active diet, targets, notes, meal times, and options read-only', async () => {
    let finish;
    getActiveDiet.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<ActiveDietPage />);

    expect(screen.getByRole('status').textContent).toContain('Carregando sua dieta');
    await act(async () => finish(activeDiet));

    expect(screen.getByRole('heading', { name: 'Olá, Ana Exemplo' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Plano semanal' })).toBeTruthy();
    expect(screen.getByText('1.800 kcal')).toBeTruthy();
    expect(screen.getByText('Observação geral')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Café da manhã' })).toBeTruthy();
    expect(screen.getByText('08:00')).toBeTruthy();
    expect(screen.getAllByText('Proteínas').length).toBeGreaterThan(0);
    expect(screen.getByText('Ovos')).toBeTruthy();
    expect(screen.getByText('2 unidades')).toBeTruthy();
    expect(screen.getByText('Cozidos')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows a clear empty state if no active diet exists', async () => {
    getActiveDiet.mockResolvedValue(null);
    render(<ActiveDietPage />);
    expect(await screen.findByRole('heading', {
      name: 'Você ainda não tem uma dieta ativa',
    })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the responsible nutritionist and a WhatsApp contact link', async () => {
    useAuth.mockReturnValue({
      session: { access_token: 'student-token' },
      profile: {
        full_name: 'Ana Exemplo',
        role: 'STUDENT',
        nutritionist: {
          full_name: 'Dra. Maria',
          whatsapp: '(11) 99999-9999',
        },
      },
    });
    getActiveDiet.mockResolvedValue(null);

    render(<ActiveDietPage />);

    expect(await screen.findByText('Dra. Maria')).toBeTruthy();
    expect(screen.getByRole('link', {
      name: 'Conversar com Dra. Maria pelo WhatsApp',
    }).getAttribute('href')).toBe('https://wa.me/5511999999999');
  });

  it('shows a recoverable error and retries the active-diet request', async () => {
    getActiveDiet
      .mockRejectedValueOnce(new Error('Serviço temporariamente indisponível.'))
      .mockResolvedValueOnce(activeDiet);
    render(<ActiveDietPage />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Serviço temporariamente indisponível.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('heading', { name: 'Plano semanal' })).toBeTruthy();
    expect(getActiveDiet).toHaveBeenCalledTimes(2);
  });
});
