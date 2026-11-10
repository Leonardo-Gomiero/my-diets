CREATE OR REPLACE FUNCTION public.save_draft_diet(
  p_student_id uuid,
  p_diet_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_diet_id uuid;
  v_student_id uuid;
  v_version integer;
  v_status text;
  v_meal jsonb;
  v_group jsonb;
  v_option jsonb;
  v_meal_id uuid;
  v_group_id uuid;
  v_meal_order integer;
  v_group_order integer;
  v_option_order integer;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid diet payload' USING ERRCODE = '22023';
  END IF;

  IF p_diet_id IS NULL THEN
    IF p_student_id IS NULL THEN
      RAISE EXCEPTION 'Student is required' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_student_id::text, 0)
    );

    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = p_student_id
        AND role = 'STUDENT'
    ) THEN
      RAISE EXCEPTION 'Student not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(pg_catalog.max(version), 0) + 1
      INTO v_version
      FROM public.diets
      WHERE student_id = p_student_id;

    INSERT INTO public.diets (
      student_id,
      title,
      version,
      status,
      target_calories,
      target_protein,
      target_carbohydrates,
      target_fats,
      notes
    )
    VALUES (
      p_student_id,
      p_payload ->> 'title',
      v_version,
      'DRAFT',
      NULLIF(p_payload ->> 'target_calories', '')::integer,
      NULLIF(p_payload ->> 'target_protein', '')::numeric,
      NULLIF(p_payload ->> 'target_carbohydrates', '')::numeric,
      NULLIF(p_payload ->> 'target_fats', '')::numeric,
      p_payload ->> 'notes'
    )
    RETURNING id INTO v_diet_id;
    v_student_id := p_student_id;
  ELSE
    SELECT student_id, version, status
      INTO v_student_id, v_version, v_status
      FROM public.diets
      WHERE id = p_diet_id
      FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Diet not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'Only drafts can be updated' USING ERRCODE = '55000';
    END IF;

    UPDATE public.diets
    SET title = p_payload ->> 'title',
        target_calories = NULLIF(p_payload ->> 'target_calories', '')::integer,
        target_protein = NULLIF(p_payload ->> 'target_protein', '')::numeric,
        target_carbohydrates = NULLIF(p_payload ->> 'target_carbohydrates', '')::numeric,
        target_fats = NULLIF(p_payload ->> 'target_fats', '')::numeric,
        notes = p_payload ->> 'notes'
    WHERE id = p_diet_id
      AND status = 'DRAFT'
    RETURNING id INTO v_diet_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Only drafts can be updated' USING ERRCODE = '55000';
    END IF;
  END IF;

  DELETE FROM public.meals WHERE diet_id = v_diet_id;

  FOR v_meal, v_meal_order IN
    SELECT value, (ordinality - 1)::integer
    FROM pg_catalog.jsonb_array_elements(p_payload -> 'meals')
      WITH ORDINALITY AS meal_items(value, ordinality)
  LOOP
    INSERT INTO public.meals (
      diet_id,
      order_index,
      name,
      scheduled_time,
      target_calories,
      notes
    )
    VALUES (
      v_diet_id,
      v_meal_order,
      v_meal ->> 'name',
      NULLIF(v_meal ->> 'scheduled_time', '')::time,
      NULLIF(v_meal ->> 'target_calories', '')::integer,
      v_meal ->> 'notes'
    )
    RETURNING id INTO v_meal_id;

    FOR v_group, v_group_order IN
      SELECT value, (ordinality - 1)::integer
      FROM pg_catalog.jsonb_array_elements(v_meal -> 'food_groups')
        WITH ORDINALITY AS group_items(value, ordinality)
    LOOP
      INSERT INTO public.food_groups (meal_id, order_index, name)
      VALUES (v_meal_id, v_group_order, v_group ->> 'name')
      RETURNING id INTO v_group_id;

      FOR v_option, v_option_order IN
        SELECT value, (ordinality - 1)::integer
        FROM pg_catalog.jsonb_array_elements(v_group -> 'options')
          WITH ORDINALITY AS option_items(value, ordinality)
      LOOP
        INSERT INTO public.food_options (
          food_group_id,
          order_index,
          label,
          food_name,
          quantity,
          unit,
          calories,
          protein,
          carbohydrates,
          fats,
          notes
        )
        VALUES (
          v_group_id,
          v_option_order,
          v_option ->> 'label',
          v_option ->> 'food_name',
          (v_option ->> 'quantity')::numeric,
          v_option ->> 'unit',
          NULLIF(v_option ->> 'calories', '')::numeric,
          NULLIF(v_option ->> 'protein', '')::numeric,
          NULLIF(v_option ->> 'carbohydrates', '')::numeric,
          NULLIF(v_option ->> 'fats', '')::numeric,
          v_option ->> 'notes'
        );
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_diet_id,
    'student_id', v_student_id,
    'version', v_version
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.save_draft_diet(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_draft_diet(uuid, uuid, jsonb)
  TO service_role;
