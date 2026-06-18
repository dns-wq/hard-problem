-- Dedicated participant projection for one caller-owned response.
-- This keeps the public API explicit without granting broader table access.

CREATE OR REPLACE FUNCTION public.get_my_live_block_response(p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
  v_response JSONB;
BEGIN
  SELECT session_id INTO v_session_id
  FROM public.live_block_runs
  WHERE id = p_run_id;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'run_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.live_sessions s
    WHERE s.id = v_session_id
      AND (
        s.host_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.live_participants lp
          WHERE lp.session_id = s.id AND lp.user_id = auth.uid()
        )
      )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'id', r.id,
    'answer', r.answer,
    'text_response', r.text_response,
    'share_scope', r.share_scope,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  )
  INTO v_response
  FROM public.live_block_responses r
  WHERE r.run_id = p_run_id
    AND r.user_id = auth.uid();

  RETURN v_response;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_live_block_response(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_live_block_response(UUID) TO authenticated;
