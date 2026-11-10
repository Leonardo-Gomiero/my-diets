CREATE TABLE public.diets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  title text NOT NULL
    CONSTRAINT diets_title_check
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  version integer NOT NULL
    CONSTRAINT diets_version_check
    CHECK (version > 0),
  status text NOT NULL DEFAULT 'DRAFT'
    CONSTRAINT diets_status_check
    CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  target_calories integer
    CONSTRAINT diets_target_calories_check
    CHECK (target_calories IS NULL OR target_calories >= 0),
  target_protein numeric
    CONSTRAINT diets_target_protein_check
    CHECK (target_protein IS NULL OR target_protein >= 0),
  target_carbohydrates numeric
    CONSTRAINT diets_target_carbohydrates_check
    CHECK (target_carbohydrates IS NULL OR target_carbohydrates >= 0),
  target_fats numeric
    CONSTRAINT diets_target_fats_check
    CHECK (target_fats IS NULL OR target_fats >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diets_student_version_unique UNIQUE (student_id, version)
);

CREATE UNIQUE INDEX diets_one_active_per_student_idx
  ON public.diets (student_id)
  WHERE status = 'ACTIVE';

CREATE TABLE public.meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diet_id uuid NOT NULL
    REFERENCES public.diets (id) ON DELETE CASCADE,
  order_index integer NOT NULL
    CONSTRAINT meals_order_index_check
    CHECK (order_index >= 0),
  name text NOT NULL
    CONSTRAINT meals_name_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  scheduled_time time,
  target_calories integer
    CONSTRAINT meals_target_calories_check
    CHECK (target_calories IS NULL OR target_calories >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meals_diet_order_unique UNIQUE (diet_id, order_index)
);

CREATE TABLE public.food_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id uuid NOT NULL
    REFERENCES public.meals (id) ON DELETE CASCADE,
  order_index integer NOT NULL
    CONSTRAINT food_groups_order_index_check
    CHECK (order_index >= 0),
  name text NOT NULL
    CONSTRAINT food_groups_name_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT food_groups_meal_order_unique UNIQUE (meal_id, order_index)
);

CREATE TABLE public.food_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_group_id uuid NOT NULL
    REFERENCES public.food_groups (id) ON DELETE CASCADE,
  order_index integer NOT NULL
    CONSTRAINT food_options_order_index_check
    CHECK (order_index >= 0),
  label text NOT NULL
    CONSTRAINT food_options_label_check
    CHECK (char_length(btrim(label)) BETWEEN 1 AND 100),
  food_name text NOT NULL
    CONSTRAINT food_options_food_name_check
    CHECK (char_length(btrim(food_name)) BETWEEN 1 AND 200),
  quantity numeric NOT NULL
    CONSTRAINT food_options_quantity_check
    CHECK (quantity >= 0),
  unit text NOT NULL
    CONSTRAINT food_options_unit_check
    CHECK (char_length(btrim(unit)) BETWEEN 1 AND 50),
  calories numeric
    CONSTRAINT food_options_calories_check
    CHECK (calories IS NULL OR calories >= 0),
  protein numeric
    CONSTRAINT food_options_protein_check
    CHECK (protein IS NULL OR protein >= 0),
  carbohydrates numeric
    CONSTRAINT food_options_carbohydrates_check
    CHECK (carbohydrates IS NULL OR carbohydrates >= 0),
  fats numeric
    CONSTRAINT food_options_fats_check
    CHECK (fats IS NULL OR fats >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT food_options_group_order_unique
    UNIQUE (food_group_id, order_index)
);

CREATE FUNCTION app_private.is_active_student()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'STUDENT'
      AND is_active
      AND NOT must_change_password
  );
$function$;

REVOKE ALL ON FUNCTION app_private.is_active_student()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_active_student()
  TO authenticated;

CREATE FUNCTION app_private.ensure_diet_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = NEW.student_id
      AND role = 'STUDENT'
  ) THEN
    RAISE EXCEPTION 'A diet must belong to a student profile'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app_private.ensure_diet_student()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER diets_require_student_profile
  BEFORE INSERT OR UPDATE ON public.diets
  FOR EACH ROW
  EXECUTE FUNCTION app_private.ensure_diet_student();

CREATE TRIGGER diets_set_updated_at
  BEFORE UPDATE ON public.diets
  FOR EACH ROW
  EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER meals_set_updated_at
  BEFORE UPDATE ON public.meals
  FOR EACH ROW
  EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER food_groups_set_updated_at
  BEFORE UPDATE ON public.food_groups
  FOR EACH ROW
  EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER food_options_set_updated_at
  BEFORE UPDATE ON public.food_options
  FOR EACH ROW
  EXECUTE FUNCTION app_private.set_updated_at();

ALTER TABLE public.diets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_options ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.diets,
  public.meals,
  public.food_groups,
  public.food_options
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.diets,
  public.meals,
  public.food_groups,
  public.food_options
TO authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE
  public.diets,
  public.meals,
  public.food_groups,
  public.food_options
TO authenticated;

CREATE POLICY diets_admin_manage
  ON public.diets
  FOR ALL
  TO authenticated
  USING ((SELECT app_private.is_active_admin()))
  WITH CHECK ((SELECT app_private.is_active_admin()));

CREATE POLICY diets_student_read_own_active
  ON public.diets
  FOR SELECT
  TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    AND status = 'ACTIVE'
    AND (SELECT app_private.is_active_student())
  );

CREATE POLICY meals_admin_manage
  ON public.meals
  FOR ALL
  TO authenticated
  USING ((SELECT app_private.is_active_admin()))
  WITH CHECK ((SELECT app_private.is_active_admin()));

CREATE POLICY meals_student_read_own_active_diet
  ON public.meals
  FOR SELECT
  TO authenticated
  USING (
    (SELECT app_private.is_active_student())
    AND EXISTS (
      SELECT 1
      FROM public.diets
      WHERE diets.id = meals.diet_id
        AND diets.student_id = (SELECT auth.uid())
        AND diets.status = 'ACTIVE'
    )
  );

CREATE POLICY food_groups_admin_manage
  ON public.food_groups
  FOR ALL
  TO authenticated
  USING ((SELECT app_private.is_active_admin()))
  WITH CHECK ((SELECT app_private.is_active_admin()));

CREATE POLICY food_groups_student_read_own_active_diet
  ON public.food_groups
  FOR SELECT
  TO authenticated
  USING (
    (SELECT app_private.is_active_student())
    AND EXISTS (
      SELECT 1
      FROM public.meals
      JOIN public.diets ON diets.id = meals.diet_id
      WHERE meals.id = food_groups.meal_id
        AND diets.student_id = (SELECT auth.uid())
        AND diets.status = 'ACTIVE'
    )
  );

CREATE POLICY food_options_admin_manage
  ON public.food_options
  FOR ALL
  TO authenticated
  USING ((SELECT app_private.is_active_admin()))
  WITH CHECK ((SELECT app_private.is_active_admin()));

CREATE POLICY food_options_student_read_own_active_diet
  ON public.food_options
  FOR SELECT
  TO authenticated
  USING (
    (SELECT app_private.is_active_student())
    AND EXISTS (
      SELECT 1
      FROM public.food_groups
      JOIN public.meals ON meals.id = food_groups.meal_id
      JOIN public.diets ON diets.id = meals.diet_id
      WHERE food_groups.id = food_options.food_group_id
        AND diets.student_id = (SELECT auth.uid())
        AND diets.status = 'ACTIVE'
    )
  );
