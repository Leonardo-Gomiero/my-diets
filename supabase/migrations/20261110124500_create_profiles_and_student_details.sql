CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text NOT NULL
    CONSTRAINT profiles_full_name_check
    CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 200),
  role text NOT NULL
    CONSTRAINT profiles_role_check
    CHECK (role IN ('ADMIN', 'STUDENT')),
  must_change_password boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_students_full_name_idx
  ON public.profiles (full_name)
  WHERE role = 'STUDENT';

CREATE TABLE public.student_details (
  user_id uuid PRIMARY KEY
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  phone text
    CONSTRAINT student_details_phone_check
    CHECK (
      phone IS NULL
      OR char_length(btrim(phone)) BETWEEN 1 AND 32
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION app_private.is_active_admin()
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
      AND role = 'ADMIN'
      AND is_active
  );
$function$;

REVOKE ALL ON FUNCTION app_private.is_active_admin()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_active_admin()
  TO authenticated;

CREATE FUNCTION app_private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app_private.set_updated_at()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER student_details_set_updated_at
  BEFORE UPDATE ON public.student_details
  FOR EACH ROW
  EXECUTE FUNCTION app_private.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_details ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT INSERT (id, full_name, role, must_change_password, is_active)
  ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name, must_change_password, is_active)
  ON TABLE public.profiles TO authenticated;

REVOKE ALL ON TABLE public.student_details FROM anon, authenticated;
GRANT SELECT ON TABLE public.student_details TO authenticated;
GRANT INSERT (user_id, phone)
  ON TABLE public.student_details TO authenticated;
GRANT UPDATE (phone)
  ON TABLE public.student_details TO authenticated;

CREATE POLICY profiles_select_self_or_students_for_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (
      role = 'STUDENT'
      AND (SELECT app_private.is_active_admin())
    )
  );

CREATE POLICY profiles_admin_insert_students
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT app_private.is_active_admin())
    AND role = 'STUDENT'
  );

CREATE POLICY profiles_admin_update_students
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT app_private.is_active_admin())
    AND role = 'STUDENT'
  )
  WITH CHECK (
    (SELECT app_private.is_active_admin())
    AND role = 'STUDENT'
  );

CREATE POLICY student_details_select_self_or_students_for_admin
  ON public.student_details
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (
      (SELECT app_private.is_active_admin())
      AND EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = student_details.user_id
          AND role = 'STUDENT'
      )
    )
  );

CREATE POLICY student_details_admin_insert_students
  ON public.student_details
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT app_private.is_active_admin())
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = student_details.user_id
        AND role = 'STUDENT'
    )
  );

CREATE POLICY student_details_admin_update_students
  ON public.student_details
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT app_private.is_active_admin())
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = student_details.user_id
        AND role = 'STUDENT'
    )
  )
  WITH CHECK (
    (SELECT app_private.is_active_admin())
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = student_details.user_id
        AND role = 'STUDENT'
    )
  );
