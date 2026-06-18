-- Hard Problem: version-2 live rundown + generalized interaction blocks.
-- Existing sessions remain format_version=1. New non-raffle sessions may opt
-- into version 2; raffle and historical paths are untouched.

ALTER TABLE public.live_sessions
  ADD COLUMN format_version INTEGER NOT NULL DEFAULT 1 CHECK (format_version IN (1, 2)),
  ADD COLUMN current_block_run_id UUID;

-- Server-owned rollout control. There are deliberately no client policies or
-- grants on this table; production changes it through the Supabase CLI.
CREATE TABLE public.live_runtime_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (key <> 'rundown_v2_creation' OR value IN ('off','internal','all'))
);
INSERT INTO public.live_runtime_config(key,value) VALUES('rundown_v2_creation','off');
ALTER TABLE public.live_runtime_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_runtime_config FROM anon,authenticated;

CREATE TABLE public.live_session_blocks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  position            INTEGER NOT NULL CHECK (position >= 0),
  kind                TEXT NOT NULL CHECK (kind IN
                        ('text','video','choice','open_text','word_cloud','scale','ranking','quiz')),
  title               TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  prompt              TEXT NOT NULL DEFAULT '' CHECK (char_length(prompt) <= 500),
  config              JSONB NOT NULL DEFAULT '{}'::jsonb,
  content             JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_type         TEXT CHECK (source_type IS NULL OR source_type IN
                        ('custom','topic_prompt','topic_anchor','paper_excerpt','topic_video','quiz_bank')),
  source_id           TEXT,
  comparison_group_id UUID,
  activated_at        TIMESTAMPTZ,
  skipped_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, position)
);

CREATE INDEX idx_live_session_blocks_session ON public.live_session_blocks(session_id, position);
CREATE INDEX idx_live_session_blocks_comparison ON public.live_session_blocks(comparison_group_id)
  WHERE comparison_group_id IS NOT NULL;

CREATE TABLE public.live_block_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  block_id          UUID NOT NULL REFERENCES public.live_session_blocks(id) ON DELETE CASCADE,
  run_number        INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','revealed')),
  block_snapshot    JSONB NOT NULL,
  response_count    INTEGER NOT NULL DEFAULT 0 CHECK (response_count >= 0),
  accepting_until   TIMESTAMPTZ,
  activation_request_id UUID,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ,
  revealed_at       TIMESTAMPTZ,
  UNIQUE (session_id, run_number)
);

CREATE UNIQUE INDEX idx_live_block_runs_activation_request
  ON public.live_block_runs(session_id, activation_request_id)
  WHERE activation_request_id IS NOT NULL;

CREATE UNIQUE INDEX one_active_live_block_run_per_session
  ON public.live_block_runs(session_id) WHERE status = 'active';
CREATE INDEX idx_live_block_runs_block ON public.live_block_runs(block_id, run_number);

ALTER TABLE public.live_sessions
  ADD CONSTRAINT fk_live_sessions_current_block_run
  FOREIGN KEY (current_block_run_id) REFERENCES public.live_block_runs(id) ON DELETE SET NULL;

CREATE TABLE public.live_block_responses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  run_id         UUID NOT NULL REFERENCES public.live_block_runs(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  answer         JSONB NOT NULL DEFAULT '{}'::jsonb,
  text_response  TEXT CHECK (text_response IS NULL OR char_length(text_response) <= 500),
  share_scope    TEXT NOT NULL DEFAULT 'private' CHECK (share_scope IN ('private','anonymous','named')),
  display_name_snapshot TEXT CHECK (display_name_snapshot IS NULL OR char_length(display_name_snapshot) <= 120),
  is_correct     BOOLEAN,
  score          INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, user_id)
);

CREATE INDEX idx_live_block_responses_session ON public.live_block_responses(session_id, run_id);
CREATE INDEX idx_live_block_responses_user ON public.live_block_responses(user_id);

CREATE TABLE public.live_response_publications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  run_id         UUID NOT NULL REFERENCES public.live_block_runs(id) ON DELETE CASCADE,
  response_id    UUID NOT NULL UNIQUE REFERENCES public.live_block_responses(id) ON DELETE CASCADE,
  display_order  INTEGER NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT true,
  published_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at     TIMESTAMPTZ
);

CREATE INDEX idx_live_response_publications_run
  ON public.live_response_publications(run_id, active, display_order);

-- Block definitions are validated both when saved and when activated.
CREATE FUNCTION public.is_valid_live_block(p_kind TEXT, p_config JSONB, p_content JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
DECLARE
  v_n INTEGER;
  v_min INTEGER;
  v_max INTEGER;
BEGIN
  IF p_kind NOT IN ('text','video') AND COALESCE(p_config->>'audience_results','on_reveal') NOT IN ('on_reveal','live','never') THEN
    RETURN false;
  END IF;
  IF p_kind IN ('open_text','word_cloud','quiz') AND COALESCE(p_config->>'audience_results','on_reveal')='live' THEN
    RETURN false;
  END IF;
  IF p_kind = 'text' THEN
    RETURN jsonb_typeof(p_content) = 'object'
      AND char_length(COALESCE(p_content->>'body','')) BETWEEN 1 AND 4000;
  ELSIF p_kind = 'video' THEN
    RETURN jsonb_typeof(p_content) = 'object'
      AND char_length(COALESCE(p_content->>'youtube_id','')) BETWEEN 1 AND 32;
  ELSIF p_kind IN ('choice','ranking') THEN
    IF jsonb_typeof(p_config->'options') <> 'array' THEN RETURN false; END IF;
    v_n := jsonb_array_length(p_config->'options');
    IF v_n < 2 OR v_n > 8 THEN RETURN false; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_config->'options') e
      WHERE char_length(COALESCE(e->>'id','')) = 0
         OR char_length(COALESCE(e->>'label','')) NOT BETWEEN 1 AND 100
    ) THEN RETURN false; END IF;
    IF (SELECT count(DISTINCT e->>'id') FROM jsonb_array_elements(p_config->'options') e) <> v_n THEN
      RETURN false;
    END IF;
    IF p_kind = 'choice' THEN
      RETURN COALESCE((p_config->>'max_selections')::INTEGER, 1) BETWEEN 1 AND v_n;
    END IF;
    RETURN COALESCE((p_config->>'required_count')::INTEGER, v_n) BETWEEN 1 AND v_n;
  ELSIF p_kind = 'open_text' THEN
    RETURN COALESCE((p_config->>'max_length')::INTEGER, 500) BETWEEN 1 AND 500;
  ELSIF p_kind = 'word_cloud' THEN
    RETURN COALESCE((p_config->>'max_entries')::INTEGER, 3) BETWEEN 1 AND 3
       AND COALESCE((p_config->>'max_entry_length')::INTEGER, 40) BETWEEN 1 AND 40;
  ELSIF p_kind = 'scale' THEN
    v_min := COALESCE((p_config->>'min')::INTEGER, 1);
    v_max := COALESCE((p_config->>'max')::INTEGER, 5);
    RETURN v_min < v_max AND (v_max - v_min + 1) BETWEEN 2 AND 10;
  ELSIF p_kind = 'quiz' THEN
    IF COALESCE((p_config->>'answer_window_sec')::INTEGER,20) NOT BETWEEN 5 AND 600 THEN RETURN false; END IF;
    IF COALESCE(p_config->>'question_type','') = 'true_false' THEN
      RETURN lower(COALESCE(p_config->>'correct_answer','')) IN ('true','false');
    END IF;
    IF COALESCE(p_config->>'question_type','') <> 'mcq'
       OR jsonb_typeof(p_config->'options') <> 'array' THEN RETURN false; END IF;
    v_n := jsonb_array_length(p_config->'options');
    RETURN v_n BETWEEN 2 AND 6
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_config->'options') e
                  WHERE e->>'id' = p_config->>'correct_answer');
  END IF;
  RETURN false;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN false;
END;
$$;

CREATE FUNCTION public.validate_live_block_response(p_snapshot JSONB, p_answer JSONB, p_text TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
DECLARE
  v_kind TEXT := p_snapshot->>'kind';
  v_config JSONB := p_snapshot->'config';
  v_n INTEGER;
  v_required INTEGER;
  v_value INTEGER;
BEGIN
  IF v_kind = 'choice' THEN
    IF jsonb_typeof(p_answer->'selections') <> 'array' THEN RETURN false; END IF;
    v_n := jsonb_array_length(p_answer->'selections');
    IF v_n < 1 OR v_n > COALESCE((v_config->>'max_selections')::INTEGER,1) THEN RETURN false; END IF;
    IF (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(p_answer->'selections') x) <> v_n THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_answer->'selections') x
               WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_config->'options') o WHERE o->>'id'=x)) THEN
      RETURN false;
    END IF;
    RETURN p_text IS NULL OR char_length(p_text) <= 280;
  ELSIF v_kind = 'open_text' THEN
    RETURN p_text IS NOT NULL AND char_length(btrim(p_text)) BETWEEN 1 AND COALESCE((v_config->>'max_length')::INTEGER,500);
  ELSIF v_kind = 'word_cloud' THEN
    IF jsonb_typeof(p_answer->'entries') <> 'array' THEN RETURN false; END IF;
    v_n := jsonb_array_length(p_answer->'entries');
    RETURN v_n BETWEEN 1 AND COALESCE((v_config->>'max_entries')::INTEGER,3)
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_answer->'entries') x
                      WHERE char_length(btrim(x)) NOT BETWEEN 1 AND COALESCE((v_config->>'max_entry_length')::INTEGER,40));
  ELSIF v_kind = 'scale' THEN
    v_value := (p_answer->>'value')::INTEGER;
    RETURN v_value BETWEEN COALESCE((v_config->>'min')::INTEGER,1) AND COALESCE((v_config->>'max')::INTEGER,5);
  ELSIF v_kind = 'ranking' THEN
    IF jsonb_typeof(p_answer->'ranking') <> 'array' THEN RETURN false; END IF;
    v_n := jsonb_array_length(p_answer->'ranking');
    v_required := COALESCE((v_config->>'required_count')::INTEGER,jsonb_array_length(v_config->'options'));
    IF v_n <> v_required OR (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(p_answer->'ranking') x) <> v_n THEN RETURN false; END IF;
    RETURN NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_answer->'ranking') x
                       WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_config->'options') o WHERE o->>'id'=x));
  ELSIF v_kind = 'quiz' THEN
    RETURN p_answer ? 'answer' AND (
      (v_config->>'question_type'='true_false' AND lower(p_answer->>'answer') IN ('true','false'))
      OR (v_config->>'question_type'='mcq' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_config->'options') o WHERE o->>'id'=p_answer->>'answer'
      ))
    );
  END IF;
  RETURN false;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN false;
END;
$$;

CREATE FUNCTION public.pin_activated_live_block()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF OLD.activated_at IS NOT NULL AND (
    NEW.kind IS DISTINCT FROM OLD.kind OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.prompt IS DISTINCT FROM OLD.prompt OR NEW.config IS DISTINCT FROM OLD.config
    OR NEW.content IS DISTINCT FROM OLD.content OR NEW.source_type IS DISTINCT FROM OLD.source_type
    OR NEW.source_id IS DISTINCT FROM OLD.source_id
    OR NEW.comparison_group_id IS DISTINCT FROM OLD.comparison_group_id
  ) THEN RAISE EXCEPTION 'block_activated'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pin_activated_live_block
  BEFORE UPDATE ON public.live_session_blocks
  FOR EACH ROW EXECUTE FUNCTION public.pin_activated_live_block();

ALTER TABLE public.live_session_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_block_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_block_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_response_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Host reads rundown blocks" ON public.live_session_blocks FOR SELECT
  USING (public.is_live_session_host(session_id));
CREATE POLICY "Host creates upcoming rundown blocks" ON public.live_session_blocks FOR INSERT
  WITH CHECK (public.is_live_session_host(session_id));
CREATE POLICY "Host edits upcoming rundown blocks" ON public.live_session_blocks FOR UPDATE
  USING (public.is_live_session_host(session_id) AND activated_at IS NULL)
  WITH CHECK (public.is_live_session_host(session_id));
CREATE POLICY "Host deletes upcoming rundown blocks" ON public.live_session_blocks FOR DELETE
  USING (public.is_live_session_host(session_id) AND activated_at IS NULL);
CREATE POLICY "Host reads block runs" ON public.live_block_runs FOR SELECT
  USING (public.is_live_session_host(session_id));
CREATE POLICY "Participant reads own block responses" ON public.live_block_responses FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Participant reads own publications" ON public.live_response_publications FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.live_block_responses r WHERE r.id=response_id AND r.user_id=auth.uid()));

REVOKE ALL ON public.live_block_runs, public.live_block_responses, public.live_response_publications FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_session_blocks TO authenticated;
GRANT SELECT ON public.live_block_runs TO authenticated;
GRANT SELECT ON public.live_block_responses, public.live_response_publications TO authenticated;

-- Atomically replace only never-activated blocks. Activated history is retained
-- and new positions are appended after it, which makes live reordering safe.
CREATE FUNCTION public.replace_live_rundown(p_session_id UUID, p_blocks JSONB)
RETURNS SETOF public.live_session_blocks
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_session public.live_sessions%ROWTYPE;
  v_base INTEGER;
  v_item JSONB;
  v_pos INTEGER;
  v_kind TEXT;
  v_config JSONB;
  v_content JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v_session FROM public.live_sessions s WHERE s.id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_session.host_id<>auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_session.format_version<>2 OR v_session.status='ended' THEN RAISE EXCEPTION 'session_closed'; END IF;
  IF jsonb_typeof(p_blocks)<>'array' OR jsonb_array_length(p_blocks)>50 THEN RAISE EXCEPTION 'bad_blocks'; END IF;

  SELECT COALESCE(max(position),-1)+1 INTO v_base FROM public.live_session_blocks
  WHERE session_id=p_session_id AND activated_at IS NOT NULL;
  DELETE FROM public.live_session_blocks WHERE session_id=p_session_id AND activated_at IS NULL;
  v_pos := v_base;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_blocks) LOOP
    v_kind := v_item->>'kind'; v_config := COALESCE(v_item->'config','{}'); v_content := COALESCE(v_item->'content','{}');
    IF NOT public.is_valid_live_block(v_kind,v_config,v_content) THEN RAISE EXCEPTION 'bad_block'; END IF;
    INSERT INTO public.live_session_blocks
      (session_id,position,kind,title,prompt,config,content,source_type,source_id,comparison_group_id,skipped_at)
    VALUES
      (p_session_id,v_pos,v_kind,COALESCE(v_item->>'title',''),COALESCE(v_item->>'prompt',''),v_config,v_content,
       NULLIF(v_item->>'source_type',''),NULLIF(v_item->>'source_id',''),NULLIF(v_item->>'comparison_group_id','')::UUID,
       CASE WHEN COALESCE((v_item->>'skipped')::BOOLEAN,false) THEN now() ELSE NULL END);
    v_pos := v_pos+1;
  END LOOP;
  RETURN QUERY SELECT * FROM public.live_session_blocks b WHERE b.session_id=p_session_id ORDER BY b.position;
END;
$$;

CREATE FUNCTION public.activate_live_block(p_session_id UUID, p_block_id UUID, p_rerun BOOLEAN DEFAULT false)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_session public.live_sessions%ROWTYPE;
  v_block public.live_session_blocks%ROWTYPE;
  v_run UUID;
  v_seq INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v_session FROM public.live_sessions s WHERE s.id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_session.host_id<>auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_session.format_version<>2 OR v_session.status='ended' THEN RAISE EXCEPTION 'session_closed'; END IF;
  SELECT * INTO v_block FROM public.live_session_blocks b WHERE b.id=p_block_id AND b.session_id=p_session_id;
  IF NOT FOUND OR v_block.skipped_at IS NOT NULL THEN RAISE EXCEPTION 'block_not_found'; END IF;
  IF v_block.activated_at IS NOT NULL AND NOT p_rerun THEN RAISE EXCEPTION 'block_activated'; END IF;
  IF NOT public.is_valid_live_block(v_block.kind,v_block.config,v_block.content) THEN RAISE EXCEPTION 'bad_block'; END IF;

  UPDATE public.live_block_runs SET status='closed',closed_at=COALESCE(closed_at,now())
    WHERE session_id=p_session_id AND status='active';
  SELECT COALESCE(max(run_number),0)+1 INTO v_seq FROM public.live_block_runs WHERE session_id=p_session_id;
  INSERT INTO public.live_block_runs(session_id,block_id,run_number,block_snapshot)
  VALUES(p_session_id,p_block_id,v_seq,jsonb_build_object(
    'kind',v_block.kind,'title',v_block.title,'prompt',v_block.prompt,'config',v_block.config,
    'content',v_block.content,'source_type',v_block.source_type,'source_id',v_block.source_id,
    'comparison_group_id',v_block.comparison_group_id,'position',v_block.position
  )) RETURNING id INTO v_run;
  UPDATE public.live_session_blocks SET activated_at=COALESCE(activated_at,now()),updated_at=now() WHERE id=p_block_id;
  UPDATE public.live_sessions SET current_block_run_id=v_run,status=CASE WHEN status='lobby' THEN 'voting' ELSE status END,updated_at=now()
    WHERE id=p_session_id;
  RETURN v_run;
END;
$$;

CREATE FUNCTION public.set_current_live_block_run(p_session_id UUID,p_run_id UUID)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_host UUID; BEGIN
  SELECT host_id INTO v_host FROM public.live_sessions WHERE id=p_session_id AND format_version=2 AND status<>'ended';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_host<>auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.live_block_runs WHERE id=p_run_id AND session_id=p_session_id) THEN RAISE EXCEPTION 'run_not_found'; END IF;
  UPDATE public.live_sessions SET current_block_run_id=p_run_id,updated_at=now() WHERE id=p_session_id;
END; $$;

CREATE FUNCTION public.close_live_block(p_session_id UUID,p_run_id UUID)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_host UUID; BEGIN
  SELECT host_id INTO v_host FROM public.live_sessions WHERE id=p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_host<>auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.live_block_runs SET status='closed',closed_at=COALESCE(closed_at,now())
    WHERE id=p_run_id AND session_id=p_session_id AND status='active';
  UPDATE public.live_sessions SET updated_at=now() WHERE id=p_session_id;
END; $$;

CREATE FUNCTION public.reveal_live_block(p_session_id UUID,p_run_id UUID)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_host UUID; v_snapshot JSONB; BEGIN
  SELECT host_id INTO v_host FROM public.live_sessions WHERE id=p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_host<>auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT block_snapshot INTO v_snapshot FROM public.live_block_runs WHERE id=p_run_id AND session_id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_snapshot->>'kind' IN ('text','video') THEN RAISE EXCEPTION 'not_revealable'; END IF;
  IF v_snapshot->>'kind'='quiz' THEN
    UPDATE public.live_block_responses SET
      is_correct=lower(answer->>'answer')=lower(v_snapshot->'config'->>'correct_answer'),
      score=CASE WHEN lower(answer->>'answer')=lower(v_snapshot->'config'->>'correct_answer')
                 THEN GREATEST(500,1000-FLOOR(EXTRACT(EPOCH FROM (created_at-(SELECT started_at FROM public.live_block_runs WHERE id=p_run_id)))*25)::INTEGER)
                 ELSE 0 END
    WHERE run_id=p_run_id;
  END IF;
  UPDATE public.live_block_runs SET status='revealed',closed_at=COALESCE(closed_at,now()),revealed_at=COALESCE(revealed_at,now()) WHERE id=p_run_id;
  UPDATE public.live_sessions SET updated_at=now() WHERE id=p_session_id;
END; $$;

CREATE FUNCTION public.submit_live_block_response(p_run_id UUID,p_answer JSONB,p_text TEXT DEFAULT NULL,p_share_scope TEXT DEFAULT 'private')
RETURNS UUID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.live_block_runs%ROWTYPE; v_id UUID; v_exists BOOLEAN; v_text TEXT; BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v_run FROM public.live_block_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.status<>'active' THEN RAISE EXCEPTION 'block_closed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.live_participants WHERE session_id=v_run.session_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_share_scope NOT IN ('private','anonymous','named') THEN RAISE EXCEPTION 'bad_scope'; END IF;
  v_text:=NULLIF(btrim(p_text),'');
  IF NOT public.validate_live_block_response(v_run.block_snapshot,COALESCE(p_answer,'{}'),v_text) THEN RAISE EXCEPTION 'bad_response'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.live_block_responses WHERE run_id=p_run_id AND user_id=auth.uid()) INTO v_exists;
  IF v_exists AND v_run.block_snapshot->>'kind'='quiz' THEN RAISE EXCEPTION 'answer_locked'; END IF;
  INSERT INTO public.live_block_responses(session_id,run_id,user_id,answer,text_response,share_scope)
  VALUES(v_run.session_id,p_run_id,auth.uid(),COALESCE(p_answer,'{}'),v_text,p_share_scope)
  ON CONFLICT(run_id,user_id) DO UPDATE SET answer=EXCLUDED.answer,text_response=EXCLUDED.text_response,
    share_scope=EXCLUDED.share_scope,updated_at=now()
  RETURNING id INTO v_id;
  IF NOT v_exists THEN UPDATE public.live_block_runs SET response_count=response_count+1 WHERE id=p_run_id; END IF;
  RETURN v_id;
END; $$;

CREATE FUNCTION public.set_live_response_share_scope(p_response_id UUID,p_share_scope TEXT)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_share_scope NOT IN ('private','anonymous','named') THEN RAISE EXCEPTION 'bad_scope'; END IF;
  UPDATE public.live_block_responses SET share_scope=p_share_scope,updated_at=now()
    WHERE id=p_response_id AND user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF p_share_scope='private' THEN
    UPDATE public.live_response_publications SET active=false,revoked_at=now() WHERE response_id=p_response_id AND active;
  END IF;
END; $$;

CREATE FUNCTION public.publish_live_response(p_response_id UUID,p_display_order INTEGER DEFAULT 0)
RETURNS UUID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_r public.live_block_responses%ROWTYPE; v_id UUID; BEGIN
  SELECT * INTO v_r FROM public.live_block_responses WHERE id=p_response_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_live_session_host(v_r.session_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_r.share_scope='private' THEN RAISE EXCEPTION 'not_consented'; END IF;
  INSERT INTO public.live_response_publications(session_id,run_id,response_id,display_order)
  VALUES(v_r.session_id,v_r.run_id,v_r.id,p_display_order)
  ON CONFLICT(response_id) DO UPDATE SET active=true,display_order=EXCLUDED.display_order,published_at=now(),revoked_at=NULL
  RETURNING id INTO v_id;
  UPDATE public.live_sessions SET updated_at=now() WHERE id=v_r.session_id;
  RETURN v_id;
END; $$;

CREATE FUNCTION public.remove_live_response_publication(p_publication_id UUID)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session UUID; BEGIN
  SELECT session_id INTO v_session FROM public.live_response_publications WHERE id=p_publication_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_live_session_host(v_session) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.live_response_publications SET active=false,revoked_at=now() WHERE id=p_publication_id;
  UPDATE public.live_sessions SET updated_at=now() WHERE id=v_session;
END; $$;

CREATE FUNCTION public.get_live_rundown(p_session_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_live_session_host(p_session_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'blocks',COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.position) FROM public.live_session_blocks b WHERE b.session_id=p_session_id),'[]'),
    'runs',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.run_number) FROM public.live_block_runs r WHERE r.session_id=p_session_id),'[]')
  );
END; $$;

CREATE FUNCTION public.get_current_live_block(p_session_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.live_sessions%ROWTYPE; v_run public.live_block_runs%ROWTYPE; v_host BOOLEAN; v_my JSONB; v_pubs JSONB; BEGIN
  SELECT * INTO v_session FROM public.live_sessions WHERE id=p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  v_host:=v_session.host_id=auth.uid();
  IF NOT v_host AND NOT public.is_live_session_participant(p_session_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_session.current_block_run_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_run FROM public.live_block_runs WHERE id=v_session.current_block_run_id;
  SELECT to_jsonb(r) INTO v_my FROM public.live_block_responses r WHERE r.run_id=v_run.id AND r.user_id=auth.uid();
  IF v_host OR (v_run.status='revealed' AND COALESCE(v_run.block_snapshot->'config'->>'audience_results','on_reveal')<>'never')
     OR COALESCE(v_run.block_snapshot->'config'->>'audience_results','on_reveal')='live' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'publication_id',p.id,'response_id',r.id,'answer',r.answer,'text',r.text_response,
      'share_scope',r.share_scope,'display_name',CASE WHEN r.share_scope='named' THEN lp.display_name ELSE NULL END
    ) ORDER BY p.display_order,p.published_at),'[]') INTO v_pubs
    FROM public.live_response_publications p JOIN public.live_block_responses r ON r.id=p.response_id
    JOIN public.live_participants lp ON lp.session_id=r.session_id AND lp.user_id=r.user_id
    WHERE p.run_id=v_run.id AND p.active AND r.share_scope<>'private';
  ELSE v_pubs:='[]'; END IF;
  RETURN jsonb_build_object('run_id',v_run.id,'block_id',v_run.block_id,'run_number',v_run.run_number,
    'status',v_run.status,'response_count',v_run.response_count,'started_at',v_run.started_at,
    'snapshot',CASE WHEN NOT v_host AND v_run.block_snapshot->>'kind'='quiz' AND v_run.status<>'revealed'
                    THEN v_run.block_snapshot #- '{config,correct_answer}' #- '{config,explanation}' ELSE v_run.block_snapshot END,
    'my_response',v_my,'publications',COALESCE(v_pubs,'[]'));
END; $$;

CREATE FUNCTION public.get_live_share_candidates(p_run_id UUID)
RETURNS TABLE(response_id UUID,answer JSONB,text_response TEXT,share_scope TEXT,display_name TEXT,created_at TIMESTAMPTZ,published BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session UUID; BEGIN
  SELECT session_id INTO v_session FROM public.live_block_runs WHERE id=p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_live_session_host(v_session) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT r.id,r.answer,r.text_response,r.share_scope,
    CASE WHEN r.share_scope='named' THEN p.display_name ELSE NULL END,r.created_at,
    EXISTS(SELECT 1 FROM public.live_response_publications pub WHERE pub.response_id=r.id AND pub.active)
  FROM public.live_block_responses r JOIN public.live_participants p ON p.session_id=r.session_id AND p.user_id=r.user_id
  WHERE r.run_id=p_run_id AND r.share_scope<>'private' ORDER BY r.created_at;
END; $$;

CREATE FUNCTION public.get_live_block_aggregate(p_run_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.live_block_runs%ROWTYPE; v_host BOOLEAN; v_kind TEXT; v_result JSONB; BEGIN
  SELECT * INTO v_run FROM public.live_block_runs WHERE id=p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  v_host:=public.is_live_session_host(v_run.session_id);
  IF NOT v_host AND NOT public.is_live_session_participant(v_run.session_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT v_host AND v_run.status<>'revealed'
     AND COALESCE(v_run.block_snapshot->'config'->>'audience_results','on_reveal')<>'live' THEN RAISE EXCEPTION 'not_revealed'; END IF;
  IF NOT v_host AND COALESCE(v_run.block_snapshot->'config'->>'audience_results','on_reveal')='never' THEN RAISE EXCEPTION 'not_revealed'; END IF;
  v_kind:=v_run.block_snapshot->>'kind';
  IF v_kind='choice' THEN
    SELECT jsonb_build_object('kind',v_kind,'total',v_run.response_count,'items',COALESCE(jsonb_agg(jsonb_build_object(
      'id',o->>'id','label',o->>'label','count',(SELECT count(*) FROM public.live_block_responses r
        WHERE r.run_id=p_run_id AND r.answer->'selections' ? (o->>'id'))) ORDER BY ord),'[]')) INTO v_result
    FROM jsonb_array_elements(v_run.block_snapshot->'config'->'options') WITH ORDINALITY x(o,ord);
  ELSIF v_kind IN ('scale','quiz') THEN
    SELECT jsonb_build_object('kind',v_kind,'total',v_run.response_count,'items',COALESCE(jsonb_agg(jsonb_build_object(
      'id',key,'label',key,'count',n) ORDER BY key),'[]'),
      'correct_answer',CASE WHEN v_kind='quiz' AND (v_host OR v_run.status='revealed') THEN v_run.block_snapshot->'config'->>'correct_answer' ELSE NULL END,
      'explanation',CASE WHEN v_kind='quiz' AND (v_host OR v_run.status='revealed') THEN v_run.block_snapshot->'config'->>'explanation' ELSE NULL END)
    INTO v_result FROM (SELECT CASE WHEN v_kind='scale' THEN answer->>'value' ELSE answer->>'answer' END key,count(*) n
                        FROM public.live_block_responses WHERE run_id=p_run_id GROUP BY 1) q;
  ELSIF v_kind='ranking' THEN
    SELECT jsonb_build_object('kind',v_kind,'total',v_run.response_count,'items',COALESCE(jsonb_agg(jsonb_build_object(
      'id',o->>'id','label',o->>'label','points',COALESCE((SELECT sum(jsonb_array_length(r.answer->'ranking')-z.ord+1)
        FROM public.live_block_responses r CROSS JOIN LATERAL jsonb_array_elements_text(r.answer->'ranking') WITH ORDINALITY z(val,ord)
        WHERE r.run_id=p_run_id AND z.val=o->>'id'),0)) ORDER BY ord),'[]')) INTO v_result
    FROM jsonb_array_elements(v_run.block_snapshot->'config'->'options') WITH ORDINALITY x(o,ord);
  ELSE
    v_result:=jsonb_build_object('kind',v_kind,'total',v_run.response_count);
  END IF;
  RETURN v_result;
END; $$;

REVOKE EXECUTE ON FUNCTION public.is_valid_live_block(TEXT,JSONB,JSONB) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.validate_live_block_response(JSONB,JSONB,TEXT) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.replace_live_rundown(UUID,JSONB) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.activate_live_block(UUID,UUID,BOOLEAN) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.set_current_live_block_run(UUID,UUID) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.close_live_block(UUID,UUID) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.reveal_live_block(UUID,UUID) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.submit_live_block_response(UUID,JSONB,TEXT,TEXT) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.set_live_response_share_scope(UUID,TEXT) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.publish_live_response(UUID,INTEGER) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.remove_live_response_publication(UUID) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.get_live_rundown(UUID) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.get_current_live_block(UUID) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.get_live_share_candidates(UUID) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.get_live_block_aggregate(UUID) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.replace_live_rundown(UUID,JSONB), public.activate_live_block(UUID,UUID,BOOLEAN),
  public.set_current_live_block_run(UUID,UUID), public.close_live_block(UUID,UUID), public.reveal_live_block(UUID,UUID),
  public.submit_live_block_response(UUID,JSONB,TEXT,TEXT), public.set_live_response_share_scope(UUID,TEXT),
  public.publish_live_response(UUID,INTEGER), public.remove_live_response_publication(UUID), public.get_live_rundown(UUID),
  public.get_current_live_block(UUID), public.get_live_share_candidates(UUID), public.get_live_block_aggregate(UUID)
TO authenticated;

-- Version-2 spotlight provenance. Legacy draws continue to use
-- minority_option_id; rundown draws snapshot the active run + choice key.
ALTER TABLE public.live_spotlight_draws
  ADD COLUMN block_run_id UUID REFERENCES public.live_block_runs(id) ON DELETE SET NULL,
  ADD COLUMN minority_choice_id TEXT;

CREATE FUNCTION public.draw_block_spotlight(p_session_id UUID,p_mode TEXT,p_exclude_user_id UUID DEFAULT NULL)
RETURNS TABLE(draw_id UUID,drawn_display_name TEXT,mode TEXT,sequence INTEGER,pool_size INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_session public.live_sessions%ROWTYPE; v_run public.live_block_runs%ROWTYPE;
  v_minority TEXT; v_eff_cycle INTEGER; v_did_reset BOOLEAN:=false; v_user UUID; v_name TEXT;
  v_pool INTEGER; v_seq INTEGER; v_draw UUID; v_no_repeat BOOLEAN;
BEGIN
  SELECT * INTO v_session FROM public.live_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_session.host_id<>auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_session.format_version<>2 OR v_session.status NOT IN ('voting','revealed') OR v_session.current_block_run_id IS NULL THEN RAISE EXCEPTION 'session_closed'; END IF;
  IF p_mode NOT IN ('uniform','no_repeat','minority_weighted','minority_steelman') THEN RAISE EXCEPTION 'bad_mode'; END IF;
  SELECT * INTO v_run FROM public.live_block_runs WHERE id=v_session.current_block_run_id;
  IF p_mode IN ('minority_weighted','minority_steelman') THEN
    IF v_run.block_snapshot->>'kind'<>'choice' THEN RAISE EXCEPTION 'minority_requires_choice'; END IF;
    SELECT o->>'id' INTO v_minority
    FROM jsonb_array_elements(v_run.block_snapshot->'config'->'options') WITH ORDINALITY x(o,ord)
    JOIN LATERAL (SELECT count(*) n FROM public.live_block_responses r WHERE r.run_id=v_run.id AND r.answer->'selections' ? (o->>'id')) c ON true
    WHERE c.n>0 ORDER BY c.n,ord LIMIT 1;
    IF v_minority IS NULL THEN RAISE EXCEPTION 'no_minority'; END IF;
  END IF;
  v_eff_cycle:=v_session.spotlight_cycle; v_no_repeat:=p_mode<>'uniform';
  LOOP
    SELECT e.user_id,e.display_name,count(*) OVER() INTO v_user,v_name,v_pool FROM (
      SELECT p.user_id,p.display_name,power(random(),1.0/CASE WHEN p_mode='minority_weighted' AND EXISTS(
        SELECT 1 FROM public.live_block_responses r WHERE r.run_id=v_run.id AND r.user_id=p.user_id AND r.answer->'selections' ? v_minority
      ) THEN 3.0 ELSE 1.0 END) sort_key
      FROM public.live_participants p WHERE p.session_id=p_session_id AND p.callable
        AND (p_exclude_user_id IS NULL OR p.user_id<>p_exclude_user_id)
        AND (p_mode<>'minority_steelman' OR EXISTS(SELECT 1 FROM public.live_block_responses r WHERE r.run_id=v_run.id AND r.user_id=p.user_id AND r.answer->'selections' ? v_minority))
        AND (NOT v_no_repeat OR NOT EXISTS(SELECT 1 FROM public.live_spotlight_draws d WHERE d.session_id=p_session_id AND d.cycle=v_eff_cycle AND d.drawn_user_id=p.user_id AND d.outcome IN ('pending','shared','passed')))
    ) e ORDER BY e.sort_key DESC LIMIT 1;
    EXIT WHEN v_user IS NOT NULL;
    IF v_no_repeat AND NOT v_did_reset THEN v_eff_cycle:=v_eff_cycle+1;v_did_reset:=true;CONTINUE;END IF;
    EXIT;
  END LOOP;
  IF v_user IS NULL THEN RAISE EXCEPTION 'no_eligible_participants'; END IF;
  SELECT COALESCE(max(d.sequence),0)+1 INTO v_seq FROM public.live_spotlight_draws d WHERE d.session_id=p_session_id;
  INSERT INTO public.live_spotlight_draws(session_id,cycle,sequence,mode,drawn_user_id,display_name,pool_size,outcome,block_run_id,minority_choice_id)
  VALUES(p_session_id,v_eff_cycle,v_seq,p_mode,v_user,v_name,v_pool,'pending',v_run.id,v_minority) RETURNING id INTO v_draw;
  UPDATE public.live_sessions SET current_spotlight_draw_id=v_draw,spotlight_cycle=v_eff_cycle,updated_at=now() WHERE id=p_session_id;
  RETURN QUERY SELECT v_draw,v_name,p_mode,v_seq,v_pool;
END; $$;

REVOKE EXECUTE ON FUNCTION public.draw_block_spotlight(UUID,TEXT,UUID) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.draw_block_spotlight(UUID,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_current_spotlight(p_session_id UUID)
RETURNS TABLE(draw_id UUID,drawn_display_name TEXT,mode TEXT,outcome TEXT,note_shared BOOLEAN,is_you BOOLEAN,drawn_note TEXT,pool_size INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.live_sessions%ROWTYPE; BEGIN
  SELECT * INTO v_session FROM public.live_sessions WHERE id=p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_session.host_id<>auth.uid() AND NOT public.is_live_session_participant(p_session_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_session.current_spotlight_draw_id IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT d.id,
    CASE WHEN d.outcome IN ('passed','cleared') AND d.drawn_user_id<>auth.uid() THEN NULL ELSE d.display_name END,
    d.mode,d.outcome,d.note_shared,d.drawn_user_id=auth.uid(),
    CASE WHEN d.drawn_user_id=auth.uid() OR d.note_shared THEN
      CASE WHEN d.block_run_id IS NULL THEN (SELECT r.note FROM public.live_responses r WHERE r.session_id=p_session_id AND r.user_id=d.drawn_user_id AND r.round_number=1)
           ELSE (SELECT r.text_response FROM public.live_block_responses r WHERE r.run_id=d.block_run_id AND r.user_id=d.drawn_user_id
                 AND (d.drawn_user_id=auth.uid() OR r.share_scope<>'private')) END
      ELSE NULL END,d.pool_size
  FROM public.live_spotlight_draws d WHERE d.id=v_session.current_spotlight_draw_id;
END; $$;

-- Include v2 responses in the existing scalar-only transcript and recap.
CREATE OR REPLACE FUNCTION public.get_live_transcript(p_user_id UUID)
RETURNS TABLE(sessions_attended BIGINT,votes_cast BIGINT,times_spotlighted BIGINT,times_shared BIGINT,steelman_count BIGINT,quiz_passed_topics BIGINT,is_public BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_public BOOLEAN; v_self BOOLEAN; BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT u.live_transcript_public INTO v_public FROM public.users u WHERE u.id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  v_self:=p_user_id=auth.uid();
  IF NOT v_self AND NOT v_public THEN RETURN QUERY SELECT 0::BIGINT,0::BIGINT,0::BIGINT,0::BIGINT,0::BIGINT,0::BIGINT,false; RETURN; END IF;
  RETURN QUERY SELECT
    (SELECT count(*) FROM public.live_participants p WHERE p.user_id=p_user_id)::BIGINT,
    ((SELECT count(*) FROM public.live_responses r WHERE r.user_id=p_user_id)+(SELECT count(*) FROM public.live_block_responses r WHERE r.user_id=p_user_id))::BIGINT,
    (SELECT count(*) FROM public.live_spotlight_draws d WHERE d.drawn_user_id=p_user_id AND d.outcome<>'cleared')::BIGINT,
    (SELECT count(*) FROM public.live_spotlight_draws d WHERE d.drawn_user_id=p_user_id AND (d.outcome='shared' OR d.note_shared))::BIGINT,
    (SELECT count(*) FROM public.live_spotlight_draws d WHERE d.drawn_user_id=p_user_id AND d.mode='minority_steelman' AND d.outcome='shared')::BIGINT,
    (SELECT count(*) FROM public.user_progress up WHERE up.user_id=p_user_id AND up.quiz_passed)::BIGINT,v_public;
END; $$;

CREATE OR REPLACE FUNCTION public.get_session_recap(p_session_id UUID)
RETURNS TABLE(participant_count BIGINT,rsvp_count BIGINT,vote_count BIGINT,spotlight_count BIGINT,spotlight_shared BIGINT,quiz_rounds BIGINT,quiz_answers BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.live_sessions%ROWTYPE; BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v_session FROM public.live_sessions WHERE id=p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_session.host_id<>auth.uid() THEN
    IF NOT public.is_live_session_participant(p_session_id) OR v_session.status NOT IN ('revealed','ended') THEN RAISE EXCEPTION 'forbidden'; END IF;
  END IF;
  RETURN QUERY SELECT
    (SELECT count(*) FROM public.live_participants WHERE session_id=p_session_id)::BIGINT,
    (SELECT count(*) FROM public.live_rsvps WHERE session_id=p_session_id)::BIGINT,
    ((SELECT count(*) FROM public.live_responses WHERE session_id=p_session_id)+(SELECT count(*) FROM public.live_block_responses WHERE session_id=p_session_id))::BIGINT,
    (SELECT count(*) FROM public.live_spotlight_draws WHERE session_id=p_session_id AND outcome<>'cleared')::BIGINT,
    (SELECT count(*) FROM public.live_spotlight_draws WHERE session_id=p_session_id AND (outcome='shared' OR note_shared))::BIGINT,
    ((SELECT count(*) FROM public.live_quiz_rounds WHERE session_id=p_session_id)+(SELECT count(*) FROM public.live_block_runs WHERE session_id=p_session_id AND block_snapshot->>'kind'='quiz'))::BIGINT,
    ((SELECT count(*) FROM public.live_quiz_answers WHERE session_id=p_session_id)+(SELECT count(*) FROM public.live_block_responses r JOIN public.live_block_runs br ON br.id=r.run_id WHERE r.session_id=p_session_id AND br.block_snapshot->>'kind'='quiz'))::BIGINT;
END; $$;

-- Host-only low-volume run activity. Response rows never enter Realtime;
-- participant phones continue to watch only the live_sessions pointer.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_block_runs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== Production hardening =====

-- Legacy sessions still use direct INSERT, but clients may not choose the
-- format or current run pointer. Version 2 is created only through the atomic
-- RPC below.
REVOKE INSERT ON public.live_sessions FROM authenticated;
GRANT INSERT (code,topic_id,host_id,status,question,raffle_mode) ON public.live_sessions TO authenticated;

CREATE FUNCTION public.create_live_rundown_session(
  p_code TEXT,
  p_topic_id UUID,
  p_question TEXT,
  p_blocks JSONB,
  p_starts_at TIMESTAMPTZ DEFAULT NULL,
  p_published BOOLEAN DEFAULT false
)
RETURNS TABLE(session_id UUID,session_code TEXT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id UUID;
  v_mode TEXT;
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT value INTO v_mode FROM public.live_runtime_config WHERE key='rundown_v2_creation';
  SELECT role INTO v_role FROM public.users WHERE id=auth.uid();
  IF COALESCE(v_mode,'off')='off' THEN RAISE EXCEPTION 'rundown_disabled'; END IF;
  IF v_mode='internal' AND COALESCE(v_role,'user') NOT IN ('editor','admin') THEN RAISE EXCEPTION 'pilot_only'; END IF;
  IF p_code !~ '^[A-HJ-NP-Z2-9]{6}$' THEN RAISE EXCEPTION 'bad_code'; END IF;
  IF char_length(COALESCE(p_question,''))>500 THEN RAISE EXCEPTION 'bad_question'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.topics WHERE id=p_topic_id AND status='published') THEN RAISE EXCEPTION 'topic_not_found'; END IF;
  IF jsonb_typeof(p_blocks)<>'array' OR jsonb_array_length(p_blocks)<1 OR jsonb_array_length(p_blocks)>50 THEN RAISE EXCEPTION 'bad_blocks'; END IF;

  INSERT INTO public.live_sessions(code,topic_id,host_id,question,format_version,starts_at,published)
  VALUES(p_code,p_topic_id,auth.uid(),COALESCE(p_question,''),2,p_starts_at,CASE WHEN p_starts_at IS NULL THEN false ELSE p_published END)
  RETURNING id INTO v_id;
  PERFORM public.replace_live_rundown(v_id,p_blocks);
  RETURN QUERY SELECT v_id,p_code;
END; $$;

CREATE FUNCTION public.activate_live_block_v2(
  p_session_id UUID,
  p_block_id UUID,
  p_rerun BOOLEAN,
  p_request_id UUID
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_session public.live_sessions%ROWTYPE;
  v_block public.live_session_blocks%ROWTYPE;
  v_existing UUID;
  v_run UUID;
  v_seq INTEGER;
  v_window INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v_session FROM public.live_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_session.host_id<>auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_session.format_version<>2 OR v_session.status='ended' THEN RAISE EXCEPTION 'session_closed'; END IF;
  IF p_request_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.live_block_runs WHERE session_id=p_session_id AND activation_request_id=p_request_id;
    IF FOUND THEN RETURN v_existing; END IF;
  END IF;
  SELECT * INTO v_block FROM public.live_session_blocks WHERE id=p_block_id AND session_id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_block.skipped_at IS NOT NULL THEN RAISE EXCEPTION 'block_not_found'; END IF;
  IF v_block.activated_at IS NOT NULL AND NOT p_rerun THEN
    SELECT id INTO v_existing FROM public.live_block_runs WHERE block_id=p_block_id ORDER BY run_number DESC LIMIT 1;
    IF v_existing=v_session.current_block_run_id THEN RETURN v_existing; END IF;
    RAISE EXCEPTION 'block_activated';
  END IF;
  IF NOT public.is_valid_live_block(v_block.kind,v_block.config,v_block.content) THEN RAISE EXCEPTION 'bad_block'; END IF;

  UPDATE public.live_block_runs SET status='closed',closed_at=COALESCE(closed_at,now())
    WHERE session_id=p_session_id AND status='active';
  SELECT COALESCE(max(run_number),0)+1 INTO v_seq FROM public.live_block_runs WHERE session_id=p_session_id;
  IF v_block.kind='quiz' THEN v_window:=NULLIF((v_block.config->>'answer_window_sec')::INTEGER,0); END IF;
  INSERT INTO public.live_block_runs(session_id,block_id,run_number,block_snapshot,accepting_until,activation_request_id)
  VALUES(p_session_id,p_block_id,v_seq,jsonb_build_object(
    'kind',v_block.kind,'title',v_block.title,'prompt',v_block.prompt,'config',v_block.config,
    'content',v_block.content,'source_type',v_block.source_type,'source_id',v_block.source_id,
    'comparison_group_id',v_block.comparison_group_id,'position',v_block.position
  ),CASE WHEN v_window IS NULL THEN NULL ELSE now()+make_interval(secs=>v_window) END,p_request_id)
  RETURNING id INTO v_run;
  UPDATE public.live_session_blocks SET activated_at=COALESCE(activated_at,now()),updated_at=now() WHERE id=p_block_id;
  UPDATE public.live_sessions SET current_block_run_id=v_run,status=CASE WHEN status='lobby' THEN 'voting' ELSE status END,updated_at=now()
    WHERE id=p_session_id;
  RETURN v_run;
END; $$;

CREATE OR REPLACE FUNCTION public.set_current_live_block_run(p_session_id UUID,p_run_id UUID)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.live_sessions%ROWTYPE; BEGIN
  SELECT * INTO v_session FROM public.live_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.format_version<>2 THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_session.host_id<>auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_session.status='ended' THEN RAISE EXCEPTION 'session_closed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.live_block_runs WHERE id=p_run_id AND session_id=p_session_id) THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_session.current_block_run_id IS DISTINCT FROM p_run_id THEN
    UPDATE public.live_sessions SET current_block_run_id=p_run_id,updated_at=now() WHERE id=p_session_id;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.close_live_block(p_session_id UUID,p_run_id UUID)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.live_sessions%ROWTYPE; v_run public.live_block_runs%ROWTYPE; BEGIN
  SELECT * INTO v_session FROM public.live_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_session.host_id<>auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_run FROM public.live_block_runs WHERE id=p_run_id AND session_id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.status='active' THEN
    UPDATE public.live_block_runs SET status='closed',closed_at=COALESCE(closed_at,now()) WHERE id=p_run_id;
    UPDATE public.live_sessions SET updated_at=now() WHERE id=p_session_id;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.reveal_live_block(p_session_id UUID,p_run_id UUID)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.live_sessions%ROWTYPE; v_run public.live_block_runs%ROWTYPE; BEGIN
  SELECT * INTO v_session FROM public.live_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_session.host_id<>auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_run FROM public.live_block_runs WHERE id=p_run_id AND session_id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.status='revealed' THEN RETURN; END IF;
  IF v_run.block_snapshot->>'kind' IN ('text','video') THEN RAISE EXCEPTION 'not_revealable'; END IF;
  IF v_run.block_snapshot->>'kind'='quiz' THEN
    UPDATE public.live_block_responses SET
      is_correct=lower(answer->>'answer')=lower(v_run.block_snapshot->'config'->>'correct_answer'),
      score=CASE WHEN lower(answer->>'answer')=lower(v_run.block_snapshot->'config'->>'correct_answer')
        THEN GREATEST(500,1000-FLOOR(EXTRACT(EPOCH FROM (created_at-v_run.started_at))*25)::INTEGER) ELSE 0 END
    WHERE run_id=p_run_id;
  END IF;
  UPDATE public.live_block_runs SET status='revealed',closed_at=COALESCE(closed_at,now()),revealed_at=COALESCE(revealed_at,now()) WHERE id=p_run_id;
  UPDATE public.live_sessions SET updated_at=now() WHERE id=p_session_id;
END; $$;

CREATE FUNCTION public.skip_live_block(p_session_id UUID,p_block_id UUID)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.live_sessions%ROWTYPE; v_block public.live_session_blocks%ROWTYPE; BEGIN
  SELECT * INTO v_session FROM public.live_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.format_version<>2 THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_session.host_id<>auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_session.status='ended' THEN RAISE EXCEPTION 'session_closed'; END IF;
  SELECT * INTO v_block FROM public.live_session_blocks WHERE id=p_block_id AND session_id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'block_not_found'; END IF;
  IF v_block.activated_at IS NOT NULL THEN RAISE EXCEPTION 'block_activated'; END IF;
  IF v_block.skipped_at IS NULL THEN UPDATE public.live_session_blocks SET skipped_at=now(),updated_at=now() WHERE id=p_block_id; END IF;
END; $$;

CREATE FUNCTION public.end_live_rundown_session(p_session_id UUID)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.live_sessions%ROWTYPE; BEGIN
  SELECT * INTO v_session FROM public.live_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.format_version<>2 THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_session.host_id<>auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_session.status='ended' THEN RETURN; END IF;
  UPDATE public.live_block_runs SET status='closed',closed_at=COALESCE(closed_at,now()) WHERE session_id=p_session_id AND status='active';
  UPDATE public.live_response_publications SET active=false,revoked_at=COALESCE(revoked_at,now()) WHERE session_id=p_session_id AND active;
  UPDATE public.live_sessions SET status='ended',ended_at=COALESCE(ended_at,now()),current_block_run_id=NULL,updated_at=now() WHERE id=p_session_id;
END; $$;

CREATE OR REPLACE FUNCTION public.submit_live_block_response(p_run_id UUID,p_answer JSONB,p_text TEXT DEFAULT NULL,p_share_scope TEXT DEFAULT 'private')
RETURNS UUID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.live_block_runs%ROWTYPE; v_id UUID; v_exists BOOLEAN; v_text TEXT; v_name TEXT; BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v_run FROM public.live_block_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.status<>'active' OR (v_run.accepting_until IS NOT NULL AND now()>v_run.accepting_until) THEN RAISE EXCEPTION 'block_closed'; END IF;
  SELECT display_name INTO v_name FROM public.live_participants WHERE session_id=v_run.session_id AND user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_share_scope NOT IN ('private','anonymous','named') THEN RAISE EXCEPTION 'bad_scope'; END IF;
  v_text:=NULLIF(btrim(p_text),'');
  IF NOT public.validate_live_block_response(v_run.block_snapshot,COALESCE(p_answer,'{}'),v_text) THEN RAISE EXCEPTION 'bad_response'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.live_block_responses WHERE run_id=p_run_id AND user_id=auth.uid()) INTO v_exists;
  IF v_exists AND v_run.block_snapshot->>'kind'='quiz' THEN RAISE EXCEPTION 'answer_locked'; END IF;
  INSERT INTO public.live_block_responses(session_id,run_id,user_id,answer,text_response,share_scope,display_name_snapshot)
  VALUES(v_run.session_id,p_run_id,auth.uid(),COALESCE(p_answer,'{}'),v_text,p_share_scope,CASE WHEN p_share_scope='named' THEN v_name ELSE NULL END)
  ON CONFLICT(run_id,user_id) DO UPDATE SET answer=EXCLUDED.answer,text_response=EXCLUDED.text_response,
    share_scope=EXCLUDED.share_scope,
    display_name_snapshot=CASE WHEN EXCLUDED.share_scope='named' THEN COALESCE(public.live_block_responses.display_name_snapshot,v_name) ELSE public.live_block_responses.display_name_snapshot END,
    updated_at=now()
  RETURNING id INTO v_id;
  IF NOT v_exists THEN UPDATE public.live_block_runs SET response_count=response_count+1 WHERE id=p_run_id; END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.set_live_response_share_scope(p_response_id UUID,p_share_scope TEXT)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_response public.live_block_responses%ROWTYPE; v_name TEXT; BEGIN
  IF p_share_scope NOT IN ('private','anonymous','named') THEN RAISE EXCEPTION 'bad_scope'; END IF;
  SELECT * INTO v_response FROM public.live_block_responses WHERE id=p_response_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF p_share_scope='named' AND v_response.display_name_snapshot IS NULL THEN
    SELECT display_name INTO v_name FROM public.live_participants WHERE session_id=v_response.session_id AND user_id=auth.uid();
  END IF;
  UPDATE public.live_block_responses SET share_scope=p_share_scope,
    display_name_snapshot=CASE WHEN p_share_scope='named' THEN COALESCE(display_name_snapshot,v_name) ELSE display_name_snapshot END,
    updated_at=now() WHERE id=p_response_id;
  IF p_share_scope='private' THEN
    UPDATE public.live_response_publications SET active=false,revoked_at=COALESCE(revoked_at,now()) WHERE response_id=p_response_id AND active;
  END IF;
  UPDATE public.live_sessions SET updated_at=now() WHERE id=v_response.session_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_current_live_block(p_session_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.live_sessions%ROWTYPE; v_run public.live_block_runs%ROWTYPE; v_host BOOLEAN; v_my JSONB; v_pubs JSONB; BEGIN
  SELECT * INTO v_session FROM public.live_sessions WHERE id=p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  v_host:=v_session.host_id=auth.uid();
  IF NOT v_host AND NOT public.is_live_session_participant(p_session_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_session.current_block_run_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_run FROM public.live_block_runs WHERE id=v_session.current_block_run_id;
  SELECT to_jsonb(r) INTO v_my FROM public.live_block_responses r WHERE r.run_id=v_run.id AND r.user_id=auth.uid();
  IF v_host OR (v_run.status='revealed' AND COALESCE(v_run.block_snapshot->'config'->>'audience_results','on_reveal')<>'never')
     OR COALESCE(v_run.block_snapshot->'config'->>'audience_results','on_reveal')='live' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'publication_id',p.id,'response_id',r.id,'answer',r.answer,'text',r.text_response,
      'share_scope',r.share_scope,'display_name',CASE WHEN r.share_scope='named' THEN r.display_name_snapshot ELSE NULL END
    ) ORDER BY p.display_order,p.published_at),'[]') INTO v_pubs
    FROM public.live_response_publications p JOIN public.live_block_responses r ON r.id=p.response_id
    WHERE p.run_id=v_run.id AND p.active AND r.share_scope<>'private';
  ELSE v_pubs:='[]'; END IF;
  RETURN jsonb_build_object('run_id',v_run.id,'block_id',v_run.block_id,'run_number',v_run.run_number,
    'status',v_run.status,'response_count',v_run.response_count,'started_at',v_run.started_at,'accepting_until',v_run.accepting_until,
    'snapshot',CASE WHEN NOT v_host AND v_run.block_snapshot->>'kind'='quiz' AND v_run.status<>'revealed'
                    THEN v_run.block_snapshot #- '{config,correct_answer}' #- '{config,explanation}' ELSE v_run.block_snapshot END,
    'my_response',v_my,'publications',COALESCE(v_pubs,'[]'));
END; $$;

CREATE OR REPLACE FUNCTION public.get_live_share_candidates(p_run_id UUID)
RETURNS TABLE(response_id UUID,answer JSONB,text_response TEXT,share_scope TEXT,display_name TEXT,created_at TIMESTAMPTZ,published BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session UUID; BEGIN
  SELECT session_id INTO v_session FROM public.live_block_runs WHERE id=p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_live_session_host(v_session) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT r.id,r.answer,r.text_response,r.share_scope,
    CASE WHEN r.share_scope='named' THEN r.display_name_snapshot ELSE NULL END,r.created_at,
    EXISTS(SELECT 1 FROM public.live_response_publications pub WHERE pub.response_id=r.id AND pub.active)
  FROM public.live_block_responses r WHERE r.run_id=p_run_id AND r.share_scope<>'private' ORDER BY r.created_at;
END; $$;

CREATE FUNCTION public.get_live_basic_distribution(p_run_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.live_block_runs%ROWTYPE; v_kind TEXT; v_items JSONB; BEGIN
  SELECT * INTO v_run FROM public.live_block_runs WHERE id=p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  v_kind:=v_run.block_snapshot->>'kind';
  IF v_kind='choice' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',o->>'id','label',o->>'label','count',
      (SELECT count(*) FROM public.live_block_responses r WHERE r.run_id=p_run_id AND r.answer->'selections' ? (o->>'id'))) ORDER BY ord),'[]')
    INTO v_items FROM jsonb_array_elements(v_run.block_snapshot->'config'->'options') WITH ORDINALITY x(o,ord);
  ELSIF v_kind='scale' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',n::TEXT,'label',n::TEXT,'count',
      (SELECT count(*) FROM public.live_block_responses r WHERE r.run_id=p_run_id AND (r.answer->>'value')::INTEGER=n)) ORDER BY n),'[]')
    INTO v_items FROM generate_series(COALESCE((v_run.block_snapshot->'config'->>'min')::INTEGER,1),
      COALESCE((v_run.block_snapshot->'config'->>'max')::INTEGER,5)) n;
  ELSIF v_kind='ranking' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',o->>'id','label',o->>'label','points',COALESCE((
      SELECT sum(jsonb_array_length(r.answer->'ranking')-z.ord+1)
      FROM public.live_block_responses r CROSS JOIN LATERAL jsonb_array_elements_text(r.answer->'ranking') WITH ORDINALITY z(val,ord)
      WHERE r.run_id=p_run_id AND z.val=o->>'id'),0)) ORDER BY ord),'[]')
    INTO v_items FROM jsonb_array_elements(v_run.block_snapshot->'config'->'options') WITH ORDINALITY x(o,ord);
  ELSIF v_kind='quiz' AND v_run.block_snapshot->'config'->>'question_type'='mcq' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',o->>'id','label',o->>'label','count',
      (SELECT count(*) FROM public.live_block_responses r WHERE r.run_id=p_run_id AND r.answer->>'answer'=o->>'id')) ORDER BY ord),'[]')
    INTO v_items FROM jsonb_array_elements(v_run.block_snapshot->'config'->'options') WITH ORDINALITY x(o,ord);
  ELSIF v_kind='quiz' THEN
    SELECT jsonb_agg(jsonb_build_object('id',q.answer,'label',initcap(q.answer),'count',
      (SELECT count(*) FROM public.live_block_responses r WHERE r.run_id=p_run_id AND lower(r.answer->>'answer')=q.answer)) ORDER BY q.ord)
    INTO v_items FROM (VALUES('true',1),('false',2)) q(answer,ord);
  ELSIF v_kind='word_cloud' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',word,'label',word,'count',n) ORDER BY n DESC,word),'[]') INTO v_items
    FROM (SELECT lower(btrim(entry)) word,count(*) n FROM public.live_response_publications p
      JOIN public.live_block_responses r ON r.id=p.response_id
      CROSS JOIN LATERAL jsonb_array_elements_text(r.answer->'entries') entry
      WHERE p.run_id=p_run_id AND p.active AND r.share_scope<>'private' GROUP BY lower(btrim(entry))) q;
  ELSE v_items:='[]'; END IF;
  RETURN jsonb_build_object('kind',v_kind,'total',v_run.response_count,'items',COALESCE(v_items,'[]'));
END; $$;

CREATE OR REPLACE FUNCTION public.get_live_block_aggregate(p_run_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_run public.live_block_runs%ROWTYPE;
  v_host BOOLEAN;
  v_kind TEXT;
  v_result JSONB;
  v_median INTEGER;
  v_previous UUID;
BEGIN
  SELECT * INTO v_run FROM public.live_block_runs WHERE id=p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  v_host:=public.is_live_session_host(v_run.session_id);
  IF NOT v_host AND NOT public.is_live_session_participant(v_run.session_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT v_host AND v_run.status<>'revealed'
    AND COALESCE(v_run.block_snapshot->'config'->>'audience_results','on_reveal')<>'live' THEN RAISE EXCEPTION 'not_revealed'; END IF;
  IF NOT v_host AND COALESCE(v_run.block_snapshot->'config'->>'audience_results','on_reveal')='never' THEN RAISE EXCEPTION 'not_revealed'; END IF;
  v_kind:=v_run.block_snapshot->>'kind';
  v_result:=public.get_live_basic_distribution(p_run_id);
  IF v_kind='scale' THEN
    SELECT percentile_disc(0.5) WITHIN GROUP(ORDER BY (answer->>'value')::INTEGER) INTO v_median
    FROM public.live_block_responses WHERE run_id=p_run_id;
    v_result:=v_result||jsonb_build_object('median',v_median);
  ELSIF v_kind='quiz' AND (v_host OR v_run.status='revealed') THEN
    v_result:=v_result||jsonb_build_object('correct_answer',v_run.block_snapshot->'config'->>'correct_answer',
      'explanation',v_run.block_snapshot->'config'->>'explanation');
  END IF;
  IF v_kind IN ('choice','scale') AND NULLIF(v_run.block_snapshot->>'comparison_group_id','') IS NOT NULL THEN
    SELECT br.id INTO v_previous FROM public.live_block_runs br
    WHERE br.session_id=v_run.session_id AND br.id<>v_run.id AND br.run_number<v_run.run_number
      AND br.block_snapshot->>'kind'=v_kind
      AND br.block_snapshot->>'comparison_group_id'=v_run.block_snapshot->>'comparison_group_id'
    ORDER BY br.run_number DESC LIMIT 1;
    IF v_previous IS NOT NULL THEN
      v_result:=v_result||jsonb_build_object('comparison',public.get_live_basic_distribution(v_previous));
    END IF;
  END IF;
  RETURN v_result;
END; $$;

CREATE FUNCTION public.get_live_quiz_leaderboard_v2(p_session_id UUID)
RETURNS TABLE(user_id UUID,display_name TEXT,total_score BIGINT,correct_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.live_sessions%ROWTYPE; v_host BOOLEAN; BEGIN
  SELECT * INTO v_session FROM public.live_sessions WHERE id=p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  v_host:=v_session.host_id=auth.uid();
  IF NOT v_host AND NOT public.is_live_session_participant(p_session_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT v_host AND NOT EXISTS(SELECT 1 FROM public.live_block_runs br WHERE br.session_id=p_session_id AND br.status='revealed'
    AND br.block_snapshot->>'kind'='quiz' AND COALESCE((br.block_snapshot->'config'->>'leaderboard')::BOOLEAN,false)) THEN RAISE EXCEPTION 'not_revealed'; END IF;
  RETURN QUERY SELECT r.user_id,COALESCE(max(r.display_name_snapshot),max(lp.display_name)),sum(r.score)::BIGINT,
    count(*) FILTER(WHERE r.is_correct)::BIGINT
  FROM public.live_block_responses r JOIN public.live_block_runs br ON br.id=r.run_id
  JOIN public.live_participants lp ON lp.session_id=r.session_id AND lp.user_id=r.user_id
  WHERE r.session_id=p_session_id AND br.block_snapshot->>'kind'='quiz'
  GROUP BY r.user_id HAVING sum(r.score)>0 ORDER BY sum(r.score) DESC,min(r.created_at);
END; $$;

REVOKE EXECUTE ON FUNCTION public.activate_live_block(UUID,UUID,BOOLEAN) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_live_basic_distribution(UUID) FROM public,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.create_live_rundown_session(TEXT,UUID,TEXT,JSONB,TIMESTAMPTZ,BOOLEAN),
  public.activate_live_block_v2(UUID,UUID,BOOLEAN,UUID),public.skip_live_block(UUID,UUID),
  public.end_live_rundown_session(UUID),public.get_live_quiz_leaderboard_v2(UUID) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.create_live_rundown_session(TEXT,UUID,TEXT,JSONB,TIMESTAMPTZ,BOOLEAN),
  public.activate_live_block_v2(UUID,UUID,BOOLEAN,UUID),public.skip_live_block(UUID,UUID),
  public.end_live_rundown_session(UUID),public.get_live_quiz_leaderboard_v2(UUID) TO authenticated;
