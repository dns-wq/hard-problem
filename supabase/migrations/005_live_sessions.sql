-- Hard Problem: Live Sessions (Sprint 1 — session + lobby + stance vote)
-- Run after 004_videos.sql in the Supabase SQL editor.
-- Spec: docs/sprint-1-live-sessions.md (v1.2). Access model: the 6-char code
-- is a held capability — never readable by non-members; pre-join interactions
-- go through the rate-limited SECURITY DEFINER RPCs at the bottom.

-- ===== Live Sessions =====

CREATE TABLE live_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT UNIQUE NOT NULL CHECK (code ~ '^[A-HJ-KM-NP-Z2-9]{6}$'),
  topic_id   UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  host_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('lobby', 'voting', 'revealed', 'ended'))
             DEFAULT 'lobby',
  question   TEXT NOT NULL DEFAULT '',  -- set at create (defaults to topic discussion_prompt); not editable after
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  ended_at   TIMESTAMPTZ
);

CREATE INDEX idx_live_sessions_host  ON live_sessions(host_id);
CREATE INDEX idx_live_sessions_topic ON live_sessions(topic_id);

-- ===== Live Session Options =====
-- Vote options snapshotted at session creation (stance tags are free text on
-- contributions — there is no stance_tags table to reference).

CREATE TABLE live_session_options (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  label             TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 100),
  source_stance_tag TEXT,  -- provenance only; tag strings can drift via admin merge
  display_order     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (session_id, label)
);

CREATE INDEX idx_live_session_options_session ON live_session_options(session_id);

-- ===== Live Participants =====

CREATE TABLE live_participants (
  session_id   UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,  -- snapshotted server-side by join_live_session; never client-supplied
  joined_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX idx_live_participants_session ON live_participants(session_id);

-- ===== Live Responses =====
-- One vote per user per round. round_number is pinned to 1 in Sprint 1
-- (policy below); multi-round is a Sprint 2+ code change.

CREATE TABLE live_responses (
  session_id   UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id    UUID NOT NULL REFERENCES live_session_options(id) ON DELETE RESTRICT,
  note         TEXT CHECK (note IS NULL OR char_length(note) <= 140),
  round_number INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (session_id, user_id, round_number)
);

CREATE INDEX idx_live_responses_session ON live_responses(session_id);

-- ===== Live Code Attempts (rate-limit ledger) =====
-- Written only by get_live_session_by_code. RLS enabled with NO policies on
-- purpose (same pattern as notifications/ai_usage inserts: definer paths only).

CREATE TABLE live_code_attempts (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,  -- minute bucket: date_trunc('minute', now())
  attempts     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, window_start)
);

-- ===== RLS Helper Predicates =====
-- SECURITY DEFINER so policies on live_* tables can check membership without
-- recursing into each other's RLS (cross-referencing the tables directly in
-- policies raises 42P17).

-- Used by RLS policies on live_session_options / live_participants / live_responses.
CREATE FUNCTION public.is_live_session_host(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_sessions
    WHERE id = p_session_id AND host_id = auth.uid()
  );
$$;

-- Used by RLS policies on live_sessions / live_session_options / live_responses.
CREATE FUNCTION public.is_live_session_participant(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_participants
    WHERE session_id = p_session_id AND user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_live_session_host(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_live_session_host(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_live_session_participant(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_live_session_participant(UUID) TO authenticated;

-- ===== Row-Level Security =====

ALTER TABLE live_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_session_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_participants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_responses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_code_attempts   ENABLE ROW LEVEL SECURITY;

-- Sessions: members only. The host disjunct MUST stay the direct column test —
-- a STABLE definer function cannot see the calling statement's own INSERT, so
-- is_live_session_host(id) here would break create's INSERT ... RETURNING.
CREATE POLICY "Members read own sessions" ON live_sessions
  FOR SELECT USING (
    host_id = auth.uid() OR public.is_live_session_participant(id)
  );
CREATE POLICY "Users create own sessions" ON live_sessions
  FOR INSERT WITH CHECK (
    host_id = auth.uid()
    AND status = 'lobby'  -- sessions cannot be born revealed/ended (trigger only guards UPDATEs)
    -- Runs under topics RLS for the inserter: blocks hosting on a topic the
    -- caller cannot see (FKs alone ignore RLS).
    AND EXISTS (SELECT 1 FROM topics t WHERE t.id = topic_id)
  );
CREATE POLICY "Hosts update own sessions" ON live_sessions
  FOR UPDATE USING (host_id = auth.uid());
-- No DELETE policy: sessions are ended, not deleted.

-- RLS gates rows, not columns: without this, a host could rewrite question/
-- code/topic_id mid-session via PostgREST. Only the state machine is mutable.
REVOKE UPDATE ON live_sessions FROM authenticated, anon;
GRANT UPDATE (status, updated_at, ended_at) ON live_sessions TO authenticated;

-- Options: members read; host edits only while the session is in lobby
-- (options are immutable once voting opens — vote integrity).
CREATE POLICY "Members read session options" ON live_session_options
  FOR SELECT USING (
    public.is_live_session_host(session_id)
    OR public.is_live_session_participant(session_id)
  );
CREATE POLICY "Hosts manage options in lobby" ON live_session_options
  FOR ALL USING (
    public.is_live_session_host(session_id)
    AND (SELECT status FROM live_sessions
         WHERE id = live_session_options.session_id) = 'lobby'
  )
  WITH CHECK (
    public.is_live_session_host(session_id)
    AND (SELECT status FROM live_sessions
         WHERE id = live_session_options.session_id) = 'lobby'
  );

-- Participants: own row + host visibility. No INSERT policy — joins go
-- exclusively through join_live_session (server-side display_name snapshot).
CREATE POLICY "Own row and host visibility" ON live_participants
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_live_session_host(session_id)
  );

-- Responses: own row + host visibility; voting gated to the voting window,
-- the caller's own membership, an option belonging to THIS session, and
-- round 1 — all at the database level.
-- NB: outer-table columns in policy subqueries MUST be qualified
-- (live_responses.session_id) — unqualified, they bind to the subquery's own
-- table and the check silently degrades to a tautology.
CREATE POLICY "Own responses and host visibility" ON live_responses
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_live_session_host(session_id)
  );
CREATE POLICY "Participants vote while voting open" ON live_responses
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND public.is_live_session_participant(session_id)
    AND (SELECT status FROM live_sessions
         WHERE id = live_responses.session_id) = 'voting'
    AND EXISTS (SELECT 1 FROM live_session_options o
                WHERE o.id = live_responses.option_id
                  AND o.session_id = live_responses.session_id)
    AND round_number = 1
  );
CREATE POLICY "Participants change vote while voting open" ON live_responses
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_live_session_participant(session_id)
    AND (SELECT status FROM live_sessions
         WHERE id = live_responses.session_id) = 'voting'
    AND EXISTS (SELECT 1 FROM live_session_options o
                WHERE o.id = live_responses.option_id
                  AND o.session_id = live_responses.session_id)
    AND round_number = 1
  );

-- ===== Trigger: session state machine =====
-- Enforces the transition map at the DB level (tRPC validates too, for clean
-- error messages): lobby→voting, voting→revealed, revealed→voting (reopen),
-- any non-ended → ended. Same-status updates pass (no-op).

CREATE FUNCTION public.enforce_live_session_transition()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF (OLD.status = 'lobby'    AND NEW.status IN ('voting', 'ended'))
  OR (OLD.status = 'voting'   AND NEW.status IN ('revealed', 'ended'))
  OR (OLD.status = 'revealed' AND NEW.status IN ('voting', 'ended'))
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid session transition % -> %', OLD.status, NEW.status;
END;
$$;

CREATE TRIGGER live_session_transition
  BEFORE UPDATE OF status ON live_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_live_session_transition();

-- ===== RPC: code lookup (rate-limited; the only pre-join read path) =====

-- Called from tRPC live.byCode. Members (host/participant of the matched
-- session) are never charged against the rate limit — they already hold the
-- code, and the play/host screens may poll. Misses and non-member hits count.
CREATE FUNCTION public.get_live_session_by_code(p_code TEXT)
RETURNS TABLE (
  id             UUID,
  status         TEXT,
  question       TEXT,
  topic_id       UUID,
  topic_title    TEXT,
  topic_slug     TEXT,
  is_host        BOOLEAN,
  is_participant BOOLEAN
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_session  public.live_sessions%ROWTYPE;
  v_found    BOOLEAN := FALSE;
  v_member   BOOLEAN := FALSE;
  v_attempts INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO v_session FROM public.live_sessions s WHERE s.code = p_code;
  v_found := FOUND;  -- the ledger DML below resets FOUND; capture it now

  IF v_found THEN
    v_member := v_session.host_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.live_participants p
                 WHERE p.session_id = v_session.id AND p.user_id = auth.uid());
  END IF;

  IF NOT v_member THEN
    -- Opportunistic ledger cleanup keeps the table tiny (no cron needed).
    DELETE FROM public.live_code_attempts a
    WHERE a.user_id = auth.uid() AND a.window_start < now() - interval '1 hour';

    INSERT INTO public.live_code_attempts (user_id, window_start)
    VALUES (auth.uid(), date_trunc('minute', now()))
    ON CONFLICT (user_id, window_start)
      DO UPDATE SET attempts = live_code_attempts.attempts + 1
    RETURNING attempts INTO v_attempts;

    IF v_attempts > 30 THEN
      RAISE EXCEPTION 'rate_limited';
    END IF;
  END IF;

  IF NOT v_found THEN
    RETURN;  -- empty set: a miss and a nonexistent code are indistinguishable
  END IF;

  RETURN QUERY
  SELECT v_session.id, v_session.status, v_session.question, v_session.topic_id,
         t.title, t.slug,
         v_session.host_id = auth.uid(),
         v_member AND v_session.host_id <> auth.uid()
  FROM public.topics t WHERE t.id = v_session.topic_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_live_session_by_code(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_live_session_by_code(TEXT) TO authenticated;

-- ===== RPC: join =====

-- Called from tRPC live.join. Snapshots display_name server-side (the client
-- never supplies it). Existing participants get a no-op success at any status
-- (the reconnect path); only NEW joins are rejected once revealed/ended.
CREATE FUNCTION public.join_live_session(p_session_id UUID)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_status       TEXT;
  v_display_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT s.status INTO v_status FROM public.live_sessions s WHERE s.id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.live_participants p
             WHERE p.session_id = p_session_id AND p.user_id = auth.uid()) THEN
    RETURN;  -- already joined: no-op success regardless of status
  END IF;

  IF v_status NOT IN ('lobby', 'voting') THEN
    RAISE EXCEPTION 'session_closed';
  END IF;

  SELECT u.display_name INTO v_display_name FROM public.users u WHERE u.id = auth.uid();
  IF NOT FOUND THEN
    -- Distinct from 'not_found' (session): a missing profile row means the
    -- signup trigger failed — surface it as its own error, not a bad code
    RAISE EXCEPTION 'profile_missing';
  END IF;

  INSERT INTO public.live_participants (session_id, user_id, display_name)
  VALUES (p_session_id, auth.uid(), v_display_name)
  ON CONFLICT (session_id, user_id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_live_session(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.join_live_session(UUID) TO authenticated;

-- ===== RPC: tally =====

-- Called from tRPC live.tally. Host may read anytime; participants/others only
-- once results are revealed (D5: the room sees aggregates, never rows).
-- RAISEs (rather than returning empty) so "no access" is distinct from a
-- legitimately zero-vote tally. LEFT JOIN keeps zero-vote options present.
CREATE FUNCTION public.get_live_tally(p_session_id UUID)
RETURNS TABLE (
  option_id         UUID,
  label             TEXT,
  display_order     INTEGER,
  vote_count        BIGINT,
  participant_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_session public.live_sessions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO v_session FROM public.live_sessions s WHERE s.id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_session.host_id <> auth.uid() AND v_session.status NOT IN ('revealed', 'ended') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT o.id, o.label, o.display_order,
         count(r.user_id)::BIGINT,
         (SELECT count(*) FROM public.live_participants p
          WHERE p.session_id = p_session_id)::BIGINT
  FROM public.live_session_options o
  LEFT JOIN public.live_responses r
    ON r.option_id = o.id AND r.session_id = o.session_id AND r.round_number = 1
  WHERE o.session_id = p_session_id
  GROUP BY o.id, o.label, o.display_order
  ORDER BY o.display_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_live_tally(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_live_tally(UUID) TO authenticated;

-- ===== Realtime publication =====
-- Phones subscribe to UPDATEs on live_sessions (filtered by id); the host
-- screen subscribes to INSERT/UPDATE on live_responses and INSERT on
-- live_participants (filtered by session_id). Idempotent: a table may already
-- have been added via the dashboard (42710).
-- Deploy check: SELECT pubname, pubinsert, pubupdate FROM pg_publication
-- WHERE pubname = 'supabase_realtime'; both pubinsert AND pubupdate must be true.

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE live_sessions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE live_responses;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE live_participants;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
