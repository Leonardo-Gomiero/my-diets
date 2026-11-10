ALTER TABLE public.profiles
  ADD COLUMN nutritionist_id uuid
  REFERENCES public.profiles (id) ON DELETE RESTRICT;

DO $migration$
DECLARE
  active_nutritionists integer;
  assigned_nutritionist_id uuid;
  has_unassigned_students boolean;
BEGIN
  SELECT count(*)
  INTO active_nutritionists
  FROM public.profiles
  WHERE role = 'ADMIN'
    AND is_active;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE role = 'STUDENT'
      AND nutritionist_id IS NULL
  )
  INTO has_unassigned_students;

  IF has_unassigned_students AND active_nutritionists <> 1 THEN
    RAISE EXCEPTION
      'Cannot assign existing students: expected exactly one active nutritionist, found %',
      active_nutritionists;
  END IF;

  IF has_unassigned_students THEN
    SELECT id
    INTO assigned_nutritionist_id
    FROM public.profiles
    WHERE role = 'ADMIN'
      AND is_active;

    UPDATE public.profiles
    SET nutritionist_id = assigned_nutritionist_id
    WHERE role = 'STUDENT'
      AND nutritionist_id IS NULL;
  END IF;
END;
$migration$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_nutritionist_role_check
  CHECK (
    (role = 'ADMIN' AND nutritionist_id IS NULL)
    OR (role = 'STUDENT' AND nutritionist_id IS NOT NULL)
  );

CREATE INDEX profiles_nutritionist_students_idx
  ON public.profiles (nutritionist_id, full_name)
  WHERE role = 'STUDENT';

CREATE TABLE public.nutritionist_details (
  user_id uuid PRIMARY KEY
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  phone text
    CONSTRAINT nutritionist_details_phone_check
    CHECK (
      phone IS NULL
      OR char_length(btrim(phone)) BETWEEN 1 AND 32
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER nutritionist_details_set_updated_at
  BEFORE UPDATE ON public.nutritionist_details
  FOR EACH ROW
  EXECUTE FUNCTION app_private.set_updated_at();

CREATE FUNCTION app_private.current_nutritionist_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT nutritionist_id
  FROM public.profiles
  WHERE id = (SELECT auth.uid())
    AND role = 'STUDENT'
    AND is_active
    AND NOT must_change_password;
$function$;

REVOKE ALL ON FUNCTION app_private.current_nutritionist_id()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.current_nutritionist_id()
  TO authenticated;

CREATE FUNCTION app_private.is_my_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT app_private.is_active_admin())
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = p_student_id
        AND role = 'STUDENT'
        AND nutritionist_id = (SELECT auth.uid())
    );
$function$;

REVOKE ALL ON FUNCTION app_private.is_my_student(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_my_student(uuid)
  TO authenticated;

CREATE FUNCTION app_private.ensure_student_nutritionist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.role = 'STUDENT' AND NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = NEW.nutritionist_id
      AND role = 'ADMIN'
      AND is_active
  ) THEN
    RAISE EXCEPTION 'A student must belong to an active nutritionist'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app_private.ensure_student_nutritionist()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER profiles_require_student_nutritionist
  BEFORE INSERT OR UPDATE OF role, nutritionist_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION app_private.ensure_student_nutritionist();

ALTER TABLE public.nutritionist_details ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.nutritionist_details FROM anon, authenticated;
GRANT SELECT ON TABLE public.nutritionist_details TO authenticated;
GRANT INSERT (user_id, phone)
  ON TABLE public.nutritionist_details TO authenticated;
GRANT UPDATE (phone)
  ON TABLE public.nutritionist_details TO authenticated;

CREATE POLICY nutritionist_details_select_owner_or_assigned_student
  ON public.nutritionist_details
  FOR SELECT
  TO authenticated
  USING (
    (
      user_id = (SELECT auth.uid())
      AND (SELECT app_private.is_active_admin())
    )
    OR user_id = (SELECT app_private.current_nutritionist_id())
  );

CREATE POLICY nutritionist_details_owner_insert
  ON public.nutritionist_details
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (SELECT app_private.is_active_admin())
  );

CREATE POLICY nutritionist_details_owner_update
  ON public.nutritionist_details
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (SELECT app_private.is_active_admin())
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (SELECT app_private.is_active_admin())
  );

DROP POLICY profiles_select_self_or_students_for_admin ON public.profiles;
CREATE POLICY profiles_select_self_or_students_for_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    (
      id = (SELECT auth.uid())
      AND is_active
      AND (
        (role = 'ADMIN' AND (SELECT app_private.is_active_admin()))
        OR (
          role = 'STUDENT'
          AND (SELECT app_private.is_active_student())
        )
      )
    )
    OR (
      role = 'STUDENT'
      AND (SELECT app_private.is_my_student(id))
    )
    OR (
      role = 'ADMIN'
      AND id = (SELECT app_private.current_nutritionist_id())
    )
  );

DROP POLICY profiles_admin_insert_students ON public.profiles;
CREATE POLICY profiles_admin_insert_students
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT app_private.is_active_admin())
    AND role = 'STUDENT'
    AND nutritionist_id = (SELECT auth.uid())
  );

DROP POLICY profiles_admin_update_students ON public.profiles;
CREATE POLICY profiles_admin_update_students
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    role = 'STUDENT'
    AND (SELECT app_private.is_my_student(id))
  )
  WITH CHECK (
    role = 'STUDENT'
    AND (SELECT app_private.is_my_student(id))
  );

GRANT INSERT (id, full_name, role, must_change_password, is_active, nutritionist_id)
  ON TABLE public.profiles TO authenticated;

DROP POLICY student_details_select_self_or_students_for_admin
  ON public.student_details;
CREATE POLICY student_details_select_self_or_students_for_admin
  ON public.student_details
  FOR SELECT
  TO authenticated
  USING (
    (
      user_id = (SELECT auth.uid())
      AND (SELECT app_private.is_active_student())
    )
    OR (SELECT app_private.is_my_student(user_id))
  );

DROP POLICY student_details_admin_insert_students
  ON public.student_details;
CREATE POLICY student_details_admin_insert_students
  ON public.student_details
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT app_private.is_my_student(user_id)));

DROP POLICY student_details_admin_update_students
  ON public.student_details;
CREATE POLICY student_details_admin_update_students
  ON public.student_details
  FOR UPDATE
  TO authenticated
  USING ((SELECT app_private.is_my_student(user_id)))
  WITH CHECK ((SELECT app_private.is_my_student(user_id)));

DROP POLICY diets_admin_manage ON public.diets;
CREATE POLICY diets_admin_manage
  ON public.diets
  FOR ALL
  TO authenticated
  USING ((SELECT app_private.is_my_student(student_id)))
  WITH CHECK ((SELECT app_private.is_my_student(student_id)));

DROP POLICY meals_admin_manage ON public.meals;
CREATE POLICY meals_admin_manage
  ON public.meals
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.diets
      WHERE diets.id = meals.diet_id
        AND (SELECT app_private.is_my_student(diets.student_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.diets
      WHERE diets.id = meals.diet_id
        AND (SELECT app_private.is_my_student(diets.student_id))
    )
  );

DROP POLICY food_groups_admin_manage ON public.food_groups;
CREATE POLICY food_groups_admin_manage
  ON public.food_groups
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meals
      JOIN public.diets ON diets.id = meals.diet_id
      WHERE meals.id = food_groups.meal_id
        AND (SELECT app_private.is_my_student(diets.student_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.meals
      JOIN public.diets ON diets.id = meals.diet_id
      WHERE meals.id = food_groups.meal_id
        AND (SELECT app_private.is_my_student(diets.student_id))
    )
  );

DROP POLICY food_options_admin_manage ON public.food_options;
CREATE POLICY food_options_admin_manage
  ON public.food_options
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.food_groups
      JOIN public.meals ON meals.id = food_groups.meal_id
      JOIN public.diets ON diets.id = meals.diet_id
      WHERE food_groups.id = food_options.food_group_id
        AND (SELECT app_private.is_my_student(diets.student_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.food_groups
      JOIN public.meals ON meals.id = food_groups.meal_id
      JOIN public.diets ON diets.id = meals.diet_id
      WHERE food_groups.id = food_options.food_group_id
        AND (SELECT app_private.is_my_student(diets.student_id))
    )
  );
