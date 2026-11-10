import { useEffect, useMemo, useRef, useState } from 'react';
import { FiArrowDown, FiArrowLeft, FiArrowUp, FiPlus, FiTrash2 } from 'react-icons/fi';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { createDietDraft, updateDietDraft } from '../services/dietService.js';
import './DietEditorPage.css';

const MAX_MEALS = 20;
const MAX_GROUPS = 20;
const MAX_OPTIONS = 10;
const MAX_TOTAL_OPTIONS = 200;
const OPTIONAL_NUMBERS = [
  ['calories', 'Calorias'],
  ['protein', 'Proteínas (g)'],
  ['carbohydrates', 'Carboidratos (g)'],
  ['fats', 'Gorduras (g)'],
];

function newOption() {
  return {
    label: '',
    food_name: '',
    quantity: '',
    unit: '',
    calories: '',
    protein: '',
    carbohydrates: '',
    fats: '',
    notes: '',
  };
}

function newGroup() {
  return { name: '', options: [newOption()] };
}

function newMeal() {
  return {
    name: '',
    scheduled_time: '',
    target_calories: '',
    notes: '',
    food_groups: [newGroup()],
  };
}

function emptyDiet() {
  return {
    title: '',
    notes: '',
    target_calories: '',
    target_protein: '',
    target_carbohydrates: '',
    target_fats: '',
    meals: [newMeal()],
  };
}

function optionalNumber(value) {
  return value === '' ? null : Number(value);
}

function toPayload(form) {
  return {
    title: form.title.trim(),
    notes: form.notes.trim() || null,
    target_calories: optionalNumber(form.target_calories),
    target_protein: optionalNumber(form.target_protein),
    target_carbohydrates: optionalNumber(form.target_carbohydrates),
    target_fats: optionalNumber(form.target_fats),
    meals: form.meals.map((meal) => ({
      name: meal.name.trim(),
      scheduled_time: meal.scheduled_time || null,
      target_calories: optionalNumber(meal.target_calories),
      notes: meal.notes.trim() || null,
      food_groups: meal.food_groups.map((group) => ({
        name: group.name.trim(),
        options: group.options.map((option) => ({
          label: option.label.trim(),
          food_name: option.food_name.trim(),
          quantity: Number(option.quantity),
          unit: option.unit.trim(),
          calories: optionalNumber(option.calories),
          protein: optionalNumber(option.protein),
          carbohydrates: optionalNumber(option.carbohydrates),
          fats: optionalNumber(option.fats),
          notes: option.notes.trim() || null,
        })),
      })),
    })),
  };
}

function validateDiet(form) {
  const errors = [];
  const numberIsValid = (value, { integer = false, required = false } = {}) => {
    if (value === '') return !required;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 1000000 &&
      (!integer || Number.isInteger(number));
  };

  if (!form.title.trim() || form.title.trim().length > 200) {
    errors.push('Informe um título com até 200 caracteres.');
  }
  if (form.notes.length > 5000) {
    errors.push('As observações gerais devem ter até 5.000 caracteres.');
  }
  const targetFields = [
    ['target_calories', 'A meta diária de calorias', true],
    ['target_protein', 'A meta diária de proteínas', false],
    ['target_carbohydrates', 'A meta diária de carboidratos', false],
    ['target_fats', 'A meta diária de gorduras', false],
  ];
  targetFields.forEach(([field, label, integer]) => {
    if (!numberIsValid(form[field], { integer })) {
      errors.push(`${label} deve ser um número não negativo${integer ? ' inteiro' : ''}.`);
    }
  });

  if (form.meals.length < 1 || form.meals.length > MAX_MEALS) {
    errors.push(`Adicione de 1 a ${MAX_MEALS} refeições.`);
  }
  let totalOptions = 0;
  form.meals.forEach((meal, mealIndex) => {
    const mealNumber = mealIndex + 1;
    if (!meal.name.trim() || meal.name.trim().length > 200) {
      errors.push(`Informe o nome da refeição ${mealNumber} (até 200 caracteres).`);
    }
    if (
      meal.scheduled_time &&
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(meal.scheduled_time)
    ) {
      errors.push(`Confira o horário da refeição ${mealNumber}.`);
    }
    if (!numberIsValid(meal.target_calories, { integer: true })) {
      errors.push(`A meta calórica da refeição ${mealNumber} deve ser inteira e não negativa.`);
    }
    if (meal.notes.length > 2000) {
      errors.push(`As notas da refeição ${mealNumber} devem ter até 2.000 caracteres.`);
    }
    if (meal.food_groups.length < 1 || meal.food_groups.length > MAX_GROUPS) {
      errors.push(`A refeição ${mealNumber} deve ter de 1 a ${MAX_GROUPS} grupos.`);
    }
    meal.food_groups.forEach((group, groupIndex) => {
      const groupNumber = `${mealNumber}.${groupIndex + 1}`;
      if (!group.name.trim() || group.name.trim().length > 200) {
        errors.push(`Informe o nome do grupo ${groupNumber} (até 200 caracteres).`);
      }
      if (group.options.length < 1 || group.options.length > MAX_OPTIONS) {
        errors.push(`O grupo ${groupNumber} deve ter de 1 a ${MAX_OPTIONS} opções.`);
      }
      totalOptions += group.options.length;
      group.options.forEach((option, optionIndex) => {
        const optionNumber = `${groupNumber}.${optionIndex + 1}`;
        if (!option.label.trim() || option.label.trim().length > 100) {
          errors.push(`Informe o rótulo da opção ${optionNumber} (até 100 caracteres).`);
        }
        if (!option.food_name.trim() || option.food_name.trim().length > 200) {
          errors.push(`Informe o alimento da opção ${optionNumber} (até 200 caracteres).`);
        }
        if (!numberIsValid(option.quantity, { required: true })) {
          errors.push(`Informe uma quantidade não negativa para a opção ${optionNumber}.`);
        }
        if (!option.unit.trim() || option.unit.trim().length > 50) {
          errors.push(`Informe a unidade da opção ${optionNumber} (até 50 caracteres).`);
        }
        ['calories', 'protein', 'carbohydrates', 'fats'].forEach((field) => {
          if (!numberIsValid(option[field])) {
            errors.push(`Confira os valores nutricionais da opção ${optionNumber}.`);
          }
        });
        if (option.notes.length > 2000) {
          errors.push(`As notas da opção ${optionNumber} devem ter até 2.000 caracteres.`);
        }
      });
    });
  });
  if (totalOptions > MAX_TOTAL_OPTIONS) {
    errors.push(`A dieta pode ter no máximo ${MAX_TOTAL_OPTIONS} opções de alimentos.`);
  }
  return errors;
}

function moveItem(items, index, offset) {
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const result = [...items];
  [result[index], result[nextIndex]] = [result[nextIndex], result[index]];
  return result;
}

function NumberField({ id, label, value, onChange, integer = false, required = false }) {
  return (
    <label className="diet-field" htmlFor={id}>
      {label}
      <input
        id={id}
        type="number"
        min="0"
        max="1000000"
        step={integer ? '1' : 'any'}
        required={required}
        value={value}
        onChange={onChange}
      />
    </label>
  );
}

export default function DietEditorPage() {
  const { patientId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const patient = location.state?.patient;
  const accessToken = session?.access_token;
  const [form, setForm] = useState(emptyDiet);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(emptyDiet()));
  const [draft, setDraft] = useState(null);
  const [fieldErrors, setFieldErrors] = useState([]);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const hasChanges = useMemo(
    () => JSON.stringify(form) !== savedSnapshot,
    [form, savedSnapshot],
  );
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;

  useEffect(() => {
    function beforeUnload(event) {
      if (!hasChangesRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    }
    function confirmLinkNavigation(event) {
      const link = event.target.closest?.('a[href]');
      const signOutButton = event.target.closest?.('button[aria-label="Sair"]');
      if ((!link && !signOutButton) || !hasChangesRef.current || link?.target || event.defaultPrevented) {
        return;
      }
      if (link) {
        const destination = new URL(link.href, window.location.href);
        if (
          destination.origin !== window.location.origin ||
          destination.pathname === window.location.pathname
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (window.confirm('Há alterações não salvas. Deseja sair e descartá-las?')) {
          hasChangesRef.current = false;
          navigate(`${destination.pathname}${destination.search}${destination.hash}`);
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (window.confirm('Há alterações não salvas. Deseja sair e descartá-las?')) {
        hasChangesRef.current = false;
      }
    }
    function confirmHistoryNavigation() {
      if (!hasChangesRef.current) return;
      if (window.confirm('Há alterações não salvas. Deseja sair e descartá-las?')) {
        hasChangesRef.current = false;
      } else {
        window.history.forward();
      }
    }
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('popstate', confirmHistoryNavigation);
    document.addEventListener('click', confirmLinkNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('popstate', confirmHistoryNavigation);
      document.removeEventListener('click', confirmLinkNavigation, true);
    };
  }, [navigate]);

  function updateForm(updater) {
    setForm((current) => (typeof updater === 'function' ? updater(current) : updater));
    setFieldErrors([]);
    setFormError('');
    setSuccessMessage('');
  }

  function leaveEditor() {
    if (
      hasChangesRef.current &&
      !window.confirm('Há alterações não salvas. Deseja sair e descartá-las?')
    ) {
      return;
    }
    hasChangesRef.current = false;
    navigate('/admin');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = validateDiet(form);
    setFieldErrors(errors);
    setFormError('');
    setSuccessMessage('');
    if (errors.length) return;

    setSaving(true);
    try {
      const payload = toPayload(form);
      const saved = draft
        ? await updateDietDraft(draft.id, payload, { accessToken })
        : await createDietDraft(patientId, payload, { accessToken });
      setDraft(saved);
      setSavedSnapshot(JSON.stringify(form));
      setSuccessMessage(
        draft
          ? 'Alterações do rascunho salvas.'
          : `Rascunho v${saved.version} criado. Você pode continuar editando e salvar novas alterações.`,
      );
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  }

  function changeMeal(mealIndex, field, value) {
    updateForm((current) => ({
      ...current,
      meals: current.meals.map((meal, index) =>
        index === mealIndex ? { ...meal, [field]: value } : meal,
      ),
    }));
  }

  function changeGroup(mealIndex, groupIndex, field, value) {
    updateForm((current) => ({
      ...current,
      meals: current.meals.map((meal, index) =>
        index === mealIndex
          ? {
              ...meal,
              food_groups: meal.food_groups.map((group, nestedIndex) =>
                nestedIndex === groupIndex ? { ...group, [field]: value } : group,
              ),
            }
          : meal,
      ),
    }));
  }

  function changeOption(mealIndex, groupIndex, optionIndex, field, value) {
    updateForm((current) => ({
      ...current,
      meals: current.meals.map((meal, index) =>
        index === mealIndex
          ? {
              ...meal,
              food_groups: meal.food_groups.map((group, nestedIndex) =>
                nestedIndex === groupIndex
                  ? {
                      ...group,
                      options: group.options.map((option, itemIndex) =>
                        itemIndex === optionIndex
                          ? { ...option, [field]: value }
                          : option,
                      ),
                    }
                  : group,
              ),
            }
          : meal,
      ),
    }));
  }

  function renderNumberFields(fields, values, onChange, prefix) {
    return fields.map(([field, label, integer = false]) => (
      <NumberField
        key={field}
        id={`${prefix}-${field}`}
        label={label}
        value={values[field]}
        integer={integer}
        onChange={(event) => onChange(field, event.target.value)}
      />
    ));
  }

  return (
    <section className="diet-editor" aria-labelledby="diet-editor-title">
      <button className="diet-editor__back" type="button" onClick={leaveEditor}>
        <FiArrowLeft aria-hidden="true" />
        Voltar às dietas
      </button>
      <header className="diet-editor__heading">
        <div>
          <span className="eyebrow">PLANO ALIMENTAR · RASCUNHO</span>
          <h1 id="diet-editor-title">{draft ? 'Editar rascunho' : 'Nova dieta'}</h1>
          <p>
            {patient?.full_name ? `Para ${patient.full_name}. ` : ''}
            As informações são inseridas por você; não há cálculos de recomendação.
          </p>
        </div>
        {draft && <span className="diet-editor__version">Rascunho v{draft.version}</span>}
      </header>

      <form className="diet-editor__form" onSubmit={handleSubmit} noValidate>
        {fieldErrors.length > 0 && (
          <div className="diet-editor__alert" role="alert" aria-labelledby="diet-validation-title">
            <strong id="diet-validation-title">Revise os dados da dieta:</strong>
            <ul>{fieldErrors.map((error) => <li key={error}>{error}</li>)}</ul>
          </div>
        )}
        {formError && <p className="diet-editor__alert" role="alert">{formError}</p>}
        {successMessage && (
          <p className="diet-editor__success" role="status" aria-live="polite">
            {successMessage}
          </p>
        )}

        <section className="diet-editor__card" aria-labelledby="diet-general-title">
          <div className="diet-editor__section-heading">
            <div>
              <span className="diet-editor__step">01</span>
              <h2 id="diet-general-title">Informações gerais</h2>
            </div>
          </div>
          <div className="diet-editor__grid">
            <label className="diet-field diet-field--wide" htmlFor="diet-title">
              Título da dieta
              <input
                id="diet-title"
                maxLength={200}
                required
                value={form.title}
                onChange={(event) => updateForm((current) => ({ ...current, title: event.target.value }))}
                aria-invalid={fieldErrors.some((error) => error.startsWith('Informe um título'))}
              />
            </label>
            <label className="diet-field diet-field--wide" htmlFor="diet-notes">
              Observações gerais <span className="diet-editor__optional">(opcional)</span>
              <textarea
                id="diet-notes"
                rows={3}
                maxLength={5000}
                value={form.notes}
                onChange={(event) => updateForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
          </div>
          <fieldset className="diet-editor__fieldset">
            <legend>Metas diárias informadas pelo nutricionista</legend>
            <div className="diet-editor__grid diet-editor__grid--targets">
              {renderNumberFields([
                ['target_calories', 'Calorias (kcal)', true],
                ['target_protein', 'Proteínas (g)'],
                ['target_carbohydrates', 'Carboidratos (g)'],
                ['target_fats', 'Gorduras (g)'],
              ], form, (field, value) => updateForm((current) => ({ ...current, [field]: value })), 'diet-target')}
            </div>
          </fieldset>
        </section>

        <div className="diet-editor__section-heading diet-editor__meals-heading">
          <div>
            <span className="diet-editor__step">02</span>
            <h2>Refeições e opções</h2>
          </div>
          <Button
            type="button"
            variant="quiet"
            disabled={form.meals.length >= MAX_MEALS}
            onClick={() => updateForm((current) => ({ ...current, meals: [...current.meals, newMeal()] }))}
          >
            <FiPlus aria-hidden="true" /> Adicionar refeição
          </Button>
        </div>

        {form.meals.map((meal, mealIndex) => (
          <fieldset className="diet-editor__meal" key={`meal-${mealIndex}`}>
            <legend className="diet-editor__meal-legend">
              <span>Refeição {mealIndex + 1}</span>
              <span className="diet-editor__reorder">
                <Button
                  type="button"
                  variant="quiet"
                  aria-label={`Mover refeição ${mealIndex + 1} para cima`}
                  disabled={mealIndex === 0}
                  onClick={() => updateForm((current) => ({ ...current, meals: moveItem(current.meals, mealIndex, -1) }))}
                ><FiArrowUp aria-hidden="true" /></Button>
                <Button
                  type="button"
                  variant="quiet"
                  aria-label={`Mover refeição ${mealIndex + 1} para baixo`}
                  disabled={mealIndex === form.meals.length - 1}
                  onClick={() => updateForm((current) => ({ ...current, meals: moveItem(current.meals, mealIndex, 1) }))}
                ><FiArrowDown aria-hidden="true" /></Button>
                <Button
                  type="button"
                  variant="quiet"
                  aria-label={`Remover refeição ${mealIndex + 1}`}
                  disabled={form.meals.length === 1}
                  onClick={() => updateForm((current) => ({ ...current, meals: current.meals.filter((_, index) => index !== mealIndex) }))}
                ><FiTrash2 aria-hidden="true" /> Remover</Button>
              </span>
            </legend>
            <div className="diet-editor__grid">
              <label className="diet-field" htmlFor={`meal-${mealIndex}-name`}>
                Nome da refeição
                <input
                  id={`meal-${mealIndex}-name`}
                  maxLength={200}
                  value={meal.name}
                  onChange={(event) => changeMeal(mealIndex, 'name', event.target.value)}
                  required
                />
              </label>
              <label className="diet-field" htmlFor={`meal-${mealIndex}-time`}>
                Horário <span className="diet-editor__optional">(opcional)</span>
                <input
                  id={`meal-${mealIndex}-time`}
                  type="time"
                  value={meal.scheduled_time}
                  onChange={(event) => changeMeal(mealIndex, 'scheduled_time', event.target.value)}
                />
              </label>
              {renderNumberFields(
                [['target_calories', 'Meta de calorias da refeição', true]],
                meal,
                (field, value) => changeMeal(mealIndex, field, value),
                `meal-${mealIndex}`,
              )}
              <label className="diet-field diet-field--wide" htmlFor={`meal-${mealIndex}-notes`}>
                Notas da refeição <span className="diet-editor__optional">(opcional)</span>
                <textarea
                  id={`meal-${mealIndex}-notes`}
                  rows={2}
                  maxLength={2000}
                  value={meal.notes}
                  onChange={(event) => changeMeal(mealIndex, 'notes', event.target.value)}
                />
              </label>
            </div>

            <div className="diet-editor__subsection-heading">
              <h3>Grupos alimentares</h3>
              <Button
                type="button"
                variant="quiet"
                disabled={meal.food_groups.length >= MAX_GROUPS}
                onClick={() => updateForm((current) => ({
                  ...current,
                  meals: current.meals.map((item, index) => index === mealIndex
                    ? { ...item, food_groups: [...item.food_groups, newGroup()] }
                    : item),
                }))}
              ><FiPlus aria-hidden="true" /> Adicionar grupo</Button>
            </div>

            {meal.food_groups.map((group, groupIndex) => (
              <fieldset className="diet-editor__group" key={`group-${mealIndex}-${groupIndex}`}>
                <legend>
                  Grupo {mealIndex + 1}.{groupIndex + 1}
                  <span className="diet-editor__reorder">
                    <Button
                      type="button"
                      variant="quiet"
                      aria-label={`Mover grupo ${groupIndex + 1} da refeição ${mealIndex + 1} para cima`}
                      disabled={groupIndex === 0}
                      onClick={() => updateForm((current) => ({
                        ...current,
                        meals: current.meals.map((item, index) => index === mealIndex
                          ? { ...item, food_groups: moveItem(item.food_groups, groupIndex, -1) }
                          : item),
                      }))}
                    ><FiArrowUp aria-hidden="true" /></Button>
                    <Button
                      type="button"
                      variant="quiet"
                      aria-label={`Mover grupo ${groupIndex + 1} da refeição ${mealIndex + 1} para baixo`}
                      disabled={groupIndex === meal.food_groups.length - 1}
                      onClick={() => updateForm((current) => ({
                        ...current,
                        meals: current.meals.map((item, index) => index === mealIndex
                          ? { ...item, food_groups: moveItem(item.food_groups, groupIndex, 1) }
                          : item),
                      }))}
                    ><FiArrowDown aria-hidden="true" /></Button>
                    <Button
                      type="button"
                      variant="quiet"
                      aria-label={`Remover grupo ${groupIndex + 1} da refeição ${mealIndex + 1}`}
                      disabled={meal.food_groups.length === 1}
                      onClick={() => updateForm((current) => ({
                        ...current,
                        meals: current.meals.map((item, index) => index === mealIndex
                          ? { ...item, food_groups: item.food_groups.filter((_, nestedIndex) => nestedIndex !== groupIndex) }
                          : item),
                      }))}
                    ><FiTrash2 aria-hidden="true" /> Remover</Button>
                  </span>
                </legend>
                <div className="diet-editor__grid diet-editor__group-fields">
                  <label className="diet-field diet-field--wide" htmlFor={`group-${mealIndex}-${groupIndex}-name`}>
                    Nome do grupo
                    <input
                      id={`group-${mealIndex}-${groupIndex}-name`}
                      maxLength={200}
                      value={group.name}
                      onChange={(event) => changeGroup(mealIndex, groupIndex, 'name', event.target.value)}
                      required
                    />
                  </label>
                </div>
                <div className="diet-editor__subsection-heading diet-editor__options-heading">
                  <h4>Opções e substituições</h4>
                  <Button
                    type="button"
                    variant="quiet"
                    disabled={group.options.length >= MAX_OPTIONS}
                    onClick={() => updateForm((current) => ({
                      ...current,
                      meals: current.meals.map((item, index) => index === mealIndex
                        ? {
                            ...item,
                            food_groups: item.food_groups.map((foodGroup, foodGroupIndex) => foodGroupIndex === groupIndex
                              ? { ...foodGroup, options: [...foodGroup.options, newOption()] }
                              : foodGroup),
                          }
                        : item),
                    }))}
                  ><FiPlus aria-hidden="true" /> Adicionar opção</Button>
                </div>
                {group.options.map((option, optionIndex) => (
                  <div className="diet-editor__option" key={`option-${mealIndex}-${groupIndex}-${optionIndex}`}>
                    <div className="diet-editor__option-heading">
                      <h5>Opção {optionIndex + 1}</h5>
                      <span className="diet-editor__reorder">
                        <Button
                          type="button"
                          variant="quiet"
                          aria-label={`Mover opção ${optionIndex + 1} do grupo ${groupIndex + 1} para cima`}
                          disabled={optionIndex === 0}
                          onClick={() => updateForm((current) => ({
                            ...current,
                            meals: current.meals.map((item, index) => index === mealIndex
                              ? {
                                  ...item,
                                  food_groups: item.food_groups.map((foodGroup, foodGroupIndex) => foodGroupIndex === groupIndex
                                    ? { ...foodGroup, options: moveItem(foodGroup.options, optionIndex, -1) }
                                    : foodGroup),
                                }
                              : item),
                          }))}
                        ><FiArrowUp aria-hidden="true" /></Button>
                        <Button
                          type="button"
                          variant="quiet"
                          aria-label={`Mover opção ${optionIndex + 1} do grupo ${groupIndex + 1} para baixo`}
                          disabled={optionIndex === group.options.length - 1}
                          onClick={() => updateForm((current) => ({
                            ...current,
                            meals: current.meals.map((item, index) => index === mealIndex
                              ? {
                                  ...item,
                                  food_groups: item.food_groups.map((foodGroup, foodGroupIndex) => foodGroupIndex === groupIndex
                                    ? { ...foodGroup, options: moveItem(foodGroup.options, optionIndex, 1) }
                                    : foodGroup),
                                }
                              : item),
                          }))}
                        ><FiArrowDown aria-hidden="true" /></Button>
                        <Button
                          type="button"
                          variant="quiet"
                          aria-label={`Remover opção ${optionIndex + 1} do grupo ${groupIndex + 1}`}
                          disabled={group.options.length === 1}
                          onClick={() => updateForm((current) => ({
                            ...current,
                            meals: current.meals.map((item, index) => index === mealIndex
                              ? {
                                  ...item,
                                  food_groups: item.food_groups.map((foodGroup, foodGroupIndex) => foodGroupIndex === groupIndex
                                    ? { ...foodGroup, options: foodGroup.options.filter((_, nestedIndex) => nestedIndex !== optionIndex) }
                                    : foodGroup),
                                }
                              : item),
                          }))}
                        ><FiTrash2 aria-hidden="true" /> Remover</Button>
                      </span>
                    </div>
                    <div className="diet-editor__grid">
                      <label className="diet-field" htmlFor={`option-${mealIndex}-${groupIndex}-${optionIndex}-label`}>
                        Identificação
                        <input
                          id={`option-${mealIndex}-${groupIndex}-${optionIndex}-label`}
                          maxLength={100}
                          placeholder="Ex.: Opção A"
                          value={option.label}
                          onChange={(event) => changeOption(mealIndex, groupIndex, optionIndex, 'label', event.target.value)}
                          required
                        />
                      </label>
                      <label className="diet-field" htmlFor={`option-${mealIndex}-${groupIndex}-${optionIndex}-food`}>
                        Alimento
                        <input
                          id={`option-${mealIndex}-${groupIndex}-${optionIndex}-food`}
                          maxLength={200}
                          value={option.food_name}
                          onChange={(event) => changeOption(mealIndex, groupIndex, optionIndex, 'food_name', event.target.value)}
                          required
                        />
                      </label>
                      <label className="diet-field" htmlFor={`option-${mealIndex}-${groupIndex}-${optionIndex}-quantity`}>
                        Quantidade
                        <input
                          id={`option-${mealIndex}-${groupIndex}-${optionIndex}-quantity`}
                          type="number"
                          min="0"
                          max="1000000"
                          step="any"
                          required
                          value={option.quantity}
                          onChange={(event) => changeOption(mealIndex, groupIndex, optionIndex, 'quantity', event.target.value)}
                        />
                      </label>
                      <label className="diet-field" htmlFor={`option-${mealIndex}-${groupIndex}-${optionIndex}-unit`}>
                        Unidade
                        <input
                          id={`option-${mealIndex}-${groupIndex}-${optionIndex}-unit`}
                          maxLength={50}
                          placeholder="Ex.: g, ml, unidade"
                          value={option.unit}
                          onChange={(event) => changeOption(mealIndex, groupIndex, optionIndex, 'unit', event.target.value)}
                          required
                        />
                      </label>
                      <div className="diet-editor__nutrition diet-editor__grid diet-editor__grid--targets diet-field--wide">
                        {renderNumberFields(
                          OPTIONAL_NUMBERS.map(([field, label]) => [field, `${label} (opcional)`]),
                          option,
                          (field, value) => changeOption(mealIndex, groupIndex, optionIndex, field, value),
                          `option-${mealIndex}-${groupIndex}-${optionIndex}`,
                        )}
                      </div>
                      <label className="diet-field diet-field--wide" htmlFor={`option-${mealIndex}-${groupIndex}-${optionIndex}-notes`}>
                        Notas <span className="diet-editor__optional">(opcional)</span>
                        <textarea
                          id={`option-${mealIndex}-${groupIndex}-${optionIndex}-notes`}
                          rows={2}
                          maxLength={2000}
                          value={option.notes}
                          onChange={(event) => changeOption(mealIndex, groupIndex, optionIndex, 'notes', event.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </fieldset>
            ))}
          </fieldset>
        ))}

        <div className="diet-editor__actions">
          <Button type="button" variant="quiet" onClick={leaveEditor} disabled={saving}>
            Sair do editor
          </Button>
          <Button type="submit" disabled={saving || (Boolean(draft) && !hasChanges)}>
            {saving ? 'Salvando…' : draft ? 'Salvar alterações' : 'Criar rascunho'}
          </Button>
        </div>
      </form>
    </section>
  );
}
