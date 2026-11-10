DROP POLICY profiles_select_self_or_students_for_admin
  ON public.profiles;

CREATE POLICY profiles_select_self_or_students_for_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    (
      id = (SELECT auth.uid())
      AND is_active
      AND (
        role = 'ADMIN'
        OR (
          role = 'STUDENT'
          AND (SELECT app_private.is_active_student())
        )
      )
    )
    OR (
      role = 'STUDENT'
      AND (SELECT app_private.is_active_admin())
    )
  );

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
