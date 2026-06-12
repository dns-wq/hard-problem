-- Hard Problem: Live Scheduling (Sprint 5 — schedule + RSVP + reminders + recap)
-- Run after 008_live_transcript.sql in the Supabase SQL editor.
-- Spec: docs/sprint-5-scheduling.md. Depends on 007 (recap reads quiz tables).
--
-- Design — NO new status. "Scheduled" = status='lobby' AND published AND
-- starts_at>now(): the session is still born in 'lobby' (the 005 INSERT WITH
-- CHECK pin and the transition trigger are untouched), it just sits unopened.
-- The schedule columns are written ONLY by the definer RPC / the service-role
-- reminder dispatch — not in the authenticated UPDATE grant, so they're
-- immutable to a direct PostgREST write.

ALTER TABLE live_sessions
  ADD COLUMN starts_at         TIMESTAMPTZ,
  ADD COLUMN published         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN reminders_sent_at TIMESTAMPTZ;

-- The cron/opportunistic scan target.
CREATE INDEX idx_live_sessions_starts_at ON live_sessions(starts_at)
  WHERE published AND status = 'lobby';

-- ===== RSVPs =====
-- Mirrors live_participants: snapshot display_name; join only via the definer
-- RPC (no INSERT policy); own-row + host SELECT; withdraw own (DELETE).

CREATE TABLE live_rsvps (
  session_id   UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX idx_live_rsvps_user ON live_rsvps(user_id);

ALTER TABLE live_rsvps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own rsvp and host visibility" ON live_rsvps
  FOR SELECT USING (user_id = auth.uid() OR public.is_live_session_host(session_id));
CREATE POLICY "Withdraw own rsvp" ON live_rsvps
  FOR DELETE USING (user_id = auth.uid());
-- No INSERT policy (RSVPs only via rsvp_live_session). No UPDATE path.
REVOKE UPDATE ON live_rsvps FROM authenticated, anon;

-- ===== Notifications: add session_reminder + session_id =====
-- The 001 inline CHECK auto-names to notifications_type_check; drop it
-- dynamically (whatever its name) before adding the widened one.

DO $$
DECLARE v_con TEXT;
BEGIN
  SELECT conname INTO v_con FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%type%';
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('build_on', 'reply', 'moderation', 'session_reminder'));
ALTER TABLE notifications ADD COLUMN session_id UUID REFERENCES live_sessions(id) ON DELETE SET NULL;
-- Reminder rows are inserted by the SERVICE-ROLE dispatch (notifications has no
-- INSERT policy by design); no new RLS policy is added here.

-- ===== RPC: schedule =====
-- Called from tRPC live.schedule. Host-only; the session must still be in lobby.
-- The ONLY write path for the pinned schedule columns. Rescheduling clears
-- reminders_sent_at so the reminder re-arms.
CREATE FUNCTION public.schedule_live_session(p_session_id UUID, p_starts_at TIMESTAMPTZ, p_publish BOOLEAN)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
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
  IF v_session.host_id <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_session.status <> 'lobby' THEN
    RAISE EXCEPTION 'session_closed';
  END IF;

  UPDATE public.live_sessions
  SET starts_at = p_starts_at,
      published = COALESCE(p_publish, false),
      reminders_sent_at = NULL,
      updated_at = now()
  WHERE id = p_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.schedule_live_session(UUID, TIMESTAMPTZ, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.schedule_live_session(UUID, TIMESTAMPTZ, BOOLEAN) TO authenticated;

-- ===== RPC: RSVP =====
-- Mirrors join_live_session. Requires the session to be published. Snapshots
-- display_name. Does NOT create a participant row — the user still joins at
-- session time. Idempotent.
CREATE FUNCTION public.rsvp_live_session(p_session_id UUID)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_published    BOOLEAN;
  v_display_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT s.published INTO v_published FROM public.live_sessions s WHERE s.id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF NOT v_published THEN
    RAISE EXCEPTION 'not_published';
  END IF;

  SELECT u.display_name INTO v_display_name FROM public.users u WHERE u.id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_missing';
  END IF;

  INSERT INTO public.live_rsvps (session_id, user_id, display_name)
  VALUES (p_session_id, auth.uid(), v_display_name)
  ON CONFLICT (session_id, user_id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rsvp_live_session(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rsvp_live_session(UUID) TO authenticated;

-- ===== RPC: session recap (aggregates only) =====
-- Clones the get_live_tally gate: host anytime; members once the session is
-- revealed/ended; else forbidden. Scalar aggregates only — never per-user rows.
-- Reads the 007 quiz tables (deploy order 007→008→009 guarantees they exist).
CREATE FUNCTION public.get_session_recap(p_session_id UUID)
RETURNS TABLE (
  participant_count BIGINT,
  rsvp_count        BIGINT,
  vote_count        BIGINT,
  spotlight_count   BIGINT,
  spotlight_shared  BIGINT,
  quiz_rounds       BIGINT,
  quiz_answers      BIGINT
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

  IF v_session.host_id <> auth.uid() THEN
    IF NOT EXISTS (SELECT 1 FROM public.live_participants p
                   WHERE p.session_id = p_session_id AND p.user_id = auth.uid()) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    IF v_session.status NOT IN ('revealed', 'ended') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.live_participants p WHERE p.session_id = p_session_id)::BIGINT,
    (SELECT count(*) FROM public.live_rsvps rv WHERE rv.session_id = p_session_id)::BIGINT,
    (SELECT count(*) FROM public.live_responses r WHERE r.session_id = p_session_id)::BIGINT,
    (SELECT count(*) FROM public.live_spotlight_draws d
       WHERE d.session_id = p_session_id AND d.outcome <> 'cleared')::BIGINT,
    (SELECT count(*) FROM public.live_spotlight_draws d
       WHERE d.session_id = p_session_id AND (d.outcome = 'shared' OR d.note_shared))::BIGINT,
    (SELECT count(*) FROM public.live_quiz_rounds qr WHERE qr.session_id = p_session_id)::BIGINT,
    (SELECT count(*) FROM public.live_quiz_answers qa WHERE qa.session_id = p_session_id)::BIGINT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_session_recap(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_session_recap(UUID) TO authenticated;

-- ===== RPC: my upcoming RSVPs =====
-- The caller's own RSVPs joined with session details. SECURITY DEFINER because
-- an RSVP'd-but-not-yet-joined user is not a participant, so RLS would hide the
-- session row from a plain join. Scoped strictly to auth.uid()'s own RSVPs, so
-- it only ever returns sessions the caller already holds (they RSVP'd via code).
CREATE FUNCTION public.get_my_upcoming_rsvps()
RETURNS TABLE (
  session_id  UUID,
  code        TEXT,
  status      TEXT,
  starts_at   TIMESTAMPTZ,
  question    TEXT,
  topic_title TEXT,
  topic_slug  TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  SELECT s.id, s.code, s.status, s.starts_at, s.question, t.title, t.slug
  FROM public.live_rsvps rv
  JOIN public.live_sessions s ON s.id = rv.session_id
  JOIN public.topics t ON t.id = s.topic_id
  WHERE rv.user_id = auth.uid() AND s.status <> 'ended'
  ORDER BY s.starts_at NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_upcoming_rsvps() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_upcoming_rsvps() TO authenticated;

-- ===== Redefine get_live_session_by_code to expose scheduling info =====
-- The RSVP page advertises the start time before a visitor reserves. Adds
-- starts_at + published to the preview (both non-sensitive). DROP+CREATE because
-- RETURNS TABLE can't change via CREATE OR REPLACE. Body is the 005 function
-- verbatim (rate-limited capability lookup, member-exempt) + two columns.

DROP FUNCTION public.get_live_session_by_code(TEXT);
CREATE FUNCTION public.get_live_session_by_code(p_code TEXT)
RETURNS TABLE (
  id             UUID,
  status         TEXT,
  question       TEXT,
  topic_id       UUID,
  topic_title    TEXT,
  topic_slug     TEXT,
  is_host        BOOLEAN,
  is_participant BOOLEAN,
  starts_at      TIMESTAMPTZ,
  published      BOOLEAN
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
  v_found := FOUND;

  IF v_found THEN
    v_member := v_session.host_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.live_participants p
                 WHERE p.session_id = v_session.id AND p.user_id = auth.uid());
  END IF;

  IF NOT v_member THEN
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
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v_session.id, v_session.status, v_session.question, v_session.topic_id,
         t.title, t.slug,
         v_session.host_id = auth.uid(),
         v_member AND v_session.host_id <> auth.uid(),
         v_session.starts_at, v_session.published
  FROM public.topics t WHERE t.id = v_session.topic_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_live_session_by_code(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_live_session_by_code(TEXT) TO authenticated;
