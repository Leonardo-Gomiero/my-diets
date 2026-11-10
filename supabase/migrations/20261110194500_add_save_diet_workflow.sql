CREATE OR REPLACE FUNCTION public.save_diet(
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
  v_student_id uuid;
  v_diet_status text;
  v_saved_diet jsonb;
  v_saved_diet_id uuid;
BEGIN
  IF p_diet_id IS NULL THEN
    IF p_student_id IS NULL THEN
      RAISE EXCEPTION 'Student is required' USING ERRCODE = '22023';
    END IF;

    v_saved_diet := public.save_draft_diet(
      p_student_id,
      NULL,
      p_payload
    );
    v_saved_diet_id := (v_saved_diet ->> 'id')::uuid;

    PERFORM public.activate_draft_diet(p_student_id, v_saved_diet_id);

    RETURN v_saved_diet || pg_catalog.jsonb_build_object('status', 'ACTIVE');
  END IF;

  SELECT student_id, status
    INTO v_student_id, v_diet_status
    FROM public.diets
    WHERE id = p_diet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Diet not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_diet_status = 'DRAFT' THEN
    v_saved_diet := public.save_draft_diet(NULL, p_diet_id, p_payload);
    RETURN v_saved_diet || pg_catalog.jsonb_build_object('status', 'DRAFT');
  END IF;

  v_saved_diet := public.save_draft_diet(v_student_id, NULL, p_payload);
  RETURN v_saved_diet || pg_catalog.jsonb_build_object('status', 'DRAFT');
END;
$function$;

REVOKE ALL ON FUNCTION public.save_diet(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_diet(uuid, uuid, jsonb)
  TO service_role;
