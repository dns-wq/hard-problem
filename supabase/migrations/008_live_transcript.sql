-- Hard Problem: Live Transcript (Sprint 4 — continuing-ed transcript + stamps)
-- Run after 007_live_quiz.sql in the Supabase SQL editor.
-- Spec: docs/sprint-4-transcript.md.
--
-- Design — DERIVE ON READ. No new tables, triggers, statuses, pointers, or
-- realtime. A single STABLE SECURITY DEFINER aggregate returns ONLY scalar
-- counts over the existing live-participation tables — structurally there is no
-- option_id / session_id / topic in the output, so the transcript can never leak
-- how or where you voted (the live invariant "the room sees aggregates, never
-- rows" extended to profiles). Stamps are computed in app code (src/lib/stamps.ts)
-- so thresholds retune without a migration.

-- ===== Consent column =====
-- Opt-IN (default false): the transcript is private until the user publishes it.
-- users RLS already allows self-update ("Users update own profile"); the column
-- is a public-readable boolean preference (users SELECT is USING(true)).

ALTER TABLE users ADD COLUMN live_transcript_public BOOLEAN NOT NULL DEFAULT false;

-- ===== User-keyed insurance indexes =====
-- The existing live_* indexes are session-keyed; the transcript counts by user.

CREATE INDEX IF NOT EXISTS idx_live_participants_user      ON live_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_live_responses_user         ON live_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_live_spotlight_draws_drawn  ON live_spotlight_draws(drawn_user_id);

-- ===== RPC: the transcript (scalar counts only) =====
-- Canonical participation definitions, defined ONCE here and reused by the recap
-- (009): times_spotlighted excludes 'cleared' (a host mulligan); times_shared =
-- outcome='shared' OR note_shared; steelman = minority_steelman AND 'shared'.
-- Privacy: a non-self viewer of an opted-out target gets an all-zero row with
-- is_public=false (NOT an error, NOT empty) so a public page degrades cleanly to
-- "transcript hidden" without a 404 and without revealing anything.
CREATE FUNCTION public.get_live_transcript(p_user_id UUID)
RETURNS TABLE (
  sessions_attended  BIGINT,
  votes_cast         BIGINT,
  times_spotlighted  BIGINT,
  times_shared       BIGINT,
  steelman_count     BIGINT,
  quiz_passed_topics BIGINT,
  is_public          BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_public BOOLEAN;
  v_self   BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';  -- authenticated-only, like the rest of the live feature
  END IF;

  SELECT u.live_transcript_public INTO v_public FROM public.users u WHERE u.id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  v_self := (p_user_id = auth.uid());

  -- Not yours and not published → degrade to a hidden, all-zero transcript
  IF NOT v_self AND NOT v_public THEN
    RETURN QUERY SELECT 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT, false;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.live_participants p WHERE p.user_id = p_user_id)::BIGINT,
    (SELECT count(*) FROM public.live_responses r WHERE r.user_id = p_user_id)::BIGINT,
    (SELECT count(*) FROM public.live_spotlight_draws d
       WHERE d.drawn_user_id = p_user_id AND d.outcome <> 'cleared')::BIGINT,
    (SELECT count(*) FROM public.live_spotlight_draws d
       WHERE d.drawn_user_id = p_user_id AND (d.outcome = 'shared' OR d.note_shared))::BIGINT,
    (SELECT count(*) FROM public.live_spotlight_draws d
       WHERE d.drawn_user_id = p_user_id AND d.mode = 'minority_steelman' AND d.outcome = 'shared')::BIGINT,
    (SELECT count(*) FROM public.user_progress up WHERE up.user_id = p_user_id AND up.quiz_passed)::BIGINT,
    v_public;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_live_transcript(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_live_transcript(UUID) TO authenticated;
