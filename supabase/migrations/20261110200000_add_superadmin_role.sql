ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_role_check,
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('ADMIN', 'STUDENT', 'SUPERADMIN'));

ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_nutritionist_role_check,
  ADD CONSTRAINT profiles_nutritionist_role_check
    CHECK (
      (role IN ('ADMIN', 'SUPERADMIN') AND nutritionist_id IS NULL)
      OR (role = 'STUDENT' AND nutritionist_id IS NOT NULL)
    ),
  ADD COLUMN admin_login text,
  ADD CONSTRAINT profiles_admin_login_check
    CHECK (
      (role = 'SUPERADMIN' AND admin_login IS NOT NULL
        AND char_length(btrim(admin_login)) BETWEEN 3 AND 32)
      OR (role <> 'SUPERADMIN' AND admin_login IS NULL)
    );

CREATE UNIQUE INDEX profiles_superadmin_login_unique_idx
  ON public.profiles (lower(admin_login))
  WHERE role = 'SUPERADMIN';

CREATE UNIQUE INDEX profiles_single_superadmin_unique_idx
  ON public.profiles (role)
  WHERE role = 'SUPERADMIN';
