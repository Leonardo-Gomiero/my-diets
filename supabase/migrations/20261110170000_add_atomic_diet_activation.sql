CREATE OR REPLACE FUNCTION public.activate_draft_diet(
  p_student_id uuid,
  p_diet_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_student_id uuid;
  v_diet_student_id uuid;
  v_diet_status text;
  v_version integer;
  v_previous_active_id uuid;
BEGIN
  SELECT id
    INTO v_student_id
    FROM public.profiles
    WHERE id = p_student_id
      AND role = 'STUDENT'
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT student_id, status, version
    INTO v_diet_student_id, v_diet_status, v_version
    FROM public.diets
    WHERE id = p_diet_id
    FOR UPDATE;

  IF NOT FOUND OR v_diet_student_id IS DISTINCT FROM p_student_id THEN
    RAISE EXCEPTION 'Diet not found for student' USING ERRCODE = 'P0002';
  END IF;

  IF v_diet_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Only drafts can be activated' USING ERRCODE = '55000';
  END IF;

  SELECT id
    INTO v_previous_active_id
    FROM public.diets
    WHERE student_id = p_student_id
      AND status = 'ACTIVE'
    FOR UPDATE;

  IF v_previous_active_id IS NOT NULL THEN
    UPDATE public.diets
      SET status = 'ARCHIVED'
      WHERE id = v_previous_active_id
        AND student_id = p_student_id
        AND status = 'ACTIVE';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Previous active diet changed' USING ERRCODE = '40001';
    END IF;
  END IF;

  UPDATE public.diets
    SET status = 'ACTIVE'
    WHERE id = p_diet_id
      AND student_id = p_student_id
      AND status = 'DRAFT';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft changed before activation' USING ERRCODE = '40001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id', p_diet_id,
    'student_id', p_student_id,
    'version', v_version,
    'status', 'ACTIVE',
    'previous_active_id', v_previous_active_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.activate_draft_diet(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_draft_diet(uuid, uuid)
  TO service_role;
