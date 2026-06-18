-- Hard Problem: Live Quiz (Sprint 3 — host-pushed quiz rounds + leaderboard)
-- Run after 006_spotlight_draw.sql in the Supabase SQL editor.
-- Spec: docs/sprint-3-live-quiz.md.
--
-- Design (clones the 006 spotlight skeleton):
--  * Quiz is ORTHOGONAL to the lobby→voting⇄revealed→ended machine — no new
--    status. The host pushes quiz_questions one at a time during voting|revealed.
--  * live_quiz_rounds (one row per pushed question, LOW volume) snapshots the
--    question content so the room/leaderboard render without re-reading the
--    admin-editable quiz_questions table. live_sessions.current_quiz_round_id is
--    the realtime nudge phones already watch — ZERO new phone subscriptions.
--  * live_quiz_answers is HIGH volume — only the host subscribes to it; phones
--    read the denormalized answer_count on the round (polled).
--  * correct_answer is withheld in PROJECTION (not RLS — quiz_questions is
--    public-read) until the round is revealed. Scoring is speed-weighted and
--    computed server-side at reveal (answer timing can't be forged).
--  * Reactions ("applause") are an ephemeral Supabase broadcast channel — NO
--    table, NO migration here.

-- ===== Schema: live_sessions quiz columns =====
-- current_quiz_round_id: the low-volume nudge pointer (RPC-only; not granted).
-- quiz_leaderboard_public: host toggle for room-visible leaderboard (granted).

ALTER TABLE live_sessions
  ADD COLUMN current_quiz_round_id   UUID,
  ADD COLUMN quiz_leaderboard_public BOOLEAN NOT NULL DEFAULT true;

-- ===== Live Quiz Rounds =====
-- LOW volume — one row per pushed question. Snapshots the question content.

CREATE TABLE live_quiz_rounds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  quiz_question_id  UUID REFERENCES quiz_questions(id) ON DELETE SET NULL,  -- provenance; snapshot is the truth
  sequence          INTEGER NOT NULL,
  question_text     TEXT NOT NULL,                       -- snapshot
  question_type     TEXT NOT NULL CHECK (question_type IN ('mcq', 'true_false')),
  options           JSONB,                               -- snapshot ([{label,text}] for mcq; NULL for T/F)
  correct_answer    TEXT NOT NULL,                       -- snapshot (label or 'true'/'false')
  explanation       TEXT,                                -- snapshot
  answer_window_sec INTEGER NOT NULL DEFAULT 20 CHECK (answer_window_sec > 0),
  status            TEXT NOT NULL DEFAULT 'asking' CHECK (status IN ('asking', 'revealed')),
  answer_count      INTEGER NOT NULL DEFAULT 0,          -- denormalized; phones read this (polled)
  asked_at          TIMESTAMPTZ DEFAULT now(),
  revealed_at       TIMESTAMPTZ,
  UNIQUE (session_id, sequence)
);

CREATE INDEX idx_live_quiz_rounds_session ON live_quiz_rounds(session_id);

-- The pointer FK is added after the table exists (avoids the create-order cycle).
ALTER TABLE live_sessions
  ADD CONSTRAINT fk_live_sessions_quiz_round
  FOREIGN KEY (current_quiz_round_id) REFERENCES live_quiz_rounds(id) ON DELETE SET NULL;

-- ===== Live Quiz Answers =====
-- HIGH volume — one row per participant per round. Host-only watch. Created and
-- graded exclusively by definer RPCs (created_at server-set → timing can't be
-- forged; first answer wins → honest speed score).

CREATE TABLE live_quiz_answers (
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  round_id   UUID NOT NULL REFERENCES live_quiz_rounds(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answer     TEXT NOT NULL,
  is_correct BOOLEAN,                       -- NULL until the round is revealed
  score      INTEGER NOT NULL DEFAULT 0,    -- set at reveal (speed-weighted)
  created_at TIMESTAMPTZ DEFAULT now(),     -- server-set answer time
  PRIMARY KEY (session_id, round_id, user_id)
);

-- ===== Row-Level Security =====

ALTER TABLE live_quiz_rounds  ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_quiz_answers ENABLE ROW LEVEL SECURITY;

-- Rounds: members read (no INSERT/UPDATE policy — rounds are written only by the
-- definer RPCs). correct_answer is on this row but is withheld in the RPC
-- projection until reveal; a direct member SELECT can see it, so the phone path
-- MUST go through get_current_quiz_round, never a raw rounds SELECT.
CREATE POLICY "Members read quiz rounds" ON live_quiz_rounds
  FOR SELECT USING (
    public.is_live_session_host(session_id)
    OR public.is_live_session_participant(session_id)
  );

-- Answers: own row + host visibility (the live_responses pattern). No INSERT/
-- UPDATE policy — answers go only through submit/reveal RPCs.
CREATE POLICY "Own answer and host visibility" ON live_quiz_answers
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_live_session_host(session_id)
  );

-- Column pin: rounds and answers are never written by a non-definer caller.
REVOKE UPDATE ON live_quiz_rounds  FROM authenticated, anon;
REVOKE UPDATE ON live_quiz_answers FROM authenticated, anon;

-- The host may toggle the leaderboard visibility on their own session (the
-- existing "Hosts update own sessions" policy gates it to the host).
-- current_quiz_round_id stays RPC-only (not granted), like the spotlight pointer.
GRANT UPDATE (quiz_leaderboard_public) ON live_sessions TO authenticated;

-- ===== Trigger: quiz round state machine =====
-- asking → revealed; revealed is terminal. Same-status passes (no-op).

CREATE FUNCTION public.enforce_live_quiz_round_transition()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'asking' AND NEW.status = 'revealed' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid quiz round transition % -> %', OLD.status, NEW.status;
END;
$$;

CREATE TRIGGER live_quiz_round_transition
  BEFORE UPDATE OF status ON live_quiz_rounds
  FOR EACH ROW EXECUTE FUNCTION public.enforce_live_quiz_round_transition();

-- ===== RPC: push a quiz question to the room =====
-- Called from tRPC live.pushQuizQuestion. Host-only; rides the live window
-- (voting|revealed). Snapshots the question content onto the round and flips the
-- pointer (the nudge). Idempotent: re-pushing the same question while it's the
-- current 'asking' round returns that round instead of duplicating.
CREATE FUNCTION public.push_live_quiz_round(p_session_id UUID, p_quiz_question_id UUID)
RETURNS TABLE (round_id UUID, sequence INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_session  public.live_sessions%ROWTYPE;
  v_q        public.quiz_questions%ROWTYPE;
  v_seq      INTEGER;
  v_round_id UUID;
  v_cur      public.live_quiz_rounds%ROWTYPE;
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
  IF v_session.status NOT IN ('voting', 'revealed') THEN
    RAISE EXCEPTION 'session_closed';
  END IF;

  SELECT * INTO v_q FROM public.quiz_questions q WHERE q.id = p_quiz_question_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_not_found';
  END IF;
  IF v_q.topic_id <> v_session.topic_id THEN
    RAISE EXCEPTION 'question_topic_mismatch';
  END IF;

  -- Idempotent re-push: same question still 'asking' as the current round
  IF v_session.current_quiz_round_id IS NOT NULL THEN
    SELECT * INTO v_cur FROM public.live_quiz_rounds r WHERE r.id = v_session.current_quiz_round_id;
    IF FOUND AND v_cur.quiz_question_id = p_quiz_question_id AND v_cur.status = 'asking' THEN
      RETURN QUERY SELECT v_cur.id, v_cur.sequence;
      RETURN;
    END IF;
  END IF;

  SELECT COALESCE(max(r.sequence), 0) + 1 INTO v_seq
  FROM public.live_quiz_rounds r WHERE r.session_id = p_session_id;

  INSERT INTO public.live_quiz_rounds
    (session_id, quiz_question_id, sequence, question_text, question_type, options, correct_answer, explanation)
  VALUES
    (p_session_id, p_quiz_question_id, v_seq, v_q.question_text, v_q.question_type, v_q.options, v_q.correct_answer, v_q.explanation)
  RETURNING id INTO v_round_id;

  UPDATE public.live_sessions
  SET current_quiz_round_id = v_round_id, updated_at = now()
  WHERE id = p_session_id;

  RETURN QUERY SELECT v_round_id, v_seq;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.push_live_quiz_round(UUID, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.push_live_quiz_round(UUID, UUID) TO authenticated;

-- ===== RPC: current quiz round (the read every screen polls/refetches) =====
-- Membership-gated. correct_answer + explanation are withheld until the round is
-- revealed (or the caller is the host). Returns the caller's own answer.
CREATE FUNCTION public.get_current_quiz_round(p_session_id UUID)
RETURNS TABLE (
  round_id          UUID,
  quiz_question_id  UUID,
  sequence          INTEGER,
  question_text     TEXT,
  question_type     TEXT,
  options           JSONB,
  correct_answer    TEXT,
  explanation       TEXT,
  status            TEXT,
  answer_window_sec INTEGER,
  answer_count      INTEGER,
  asked_at          TIMESTAMPTZ,
  my_answer         TEXT,
  my_is_correct     BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_session public.live_sessions%ROWTYPE;
  v_host    BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO v_session FROM public.live_sessions s WHERE s.id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  v_host := v_session.host_id = auth.uid();
  IF NOT v_host
     AND NOT EXISTS (SELECT 1 FROM public.live_participants p
                     WHERE p.session_id = p_session_id AND p.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_session.current_quiz_round_id IS NULL THEN
    RETURN;  -- no active quiz round
  END IF;

  RETURN QUERY
  SELECT r.id, r.quiz_question_id, r.sequence, r.question_text, r.question_type, r.options,
         CASE WHEN v_host OR r.status = 'revealed' THEN r.correct_answer ELSE NULL END,
         CASE WHEN v_host OR r.status = 'revealed' THEN r.explanation ELSE NULL END,
         r.status, r.answer_window_sec, r.answer_count, r.asked_at,
         (SELECT a.answer FROM public.live_quiz_answers a
          WHERE a.round_id = r.id AND a.user_id = auth.uid()),
         (SELECT a.is_correct FROM public.live_quiz_answers a
          WHERE a.round_id = r.id AND a.user_id = auth.uid())
  FROM public.live_quiz_rounds r
  WHERE r.id = v_session.current_quiz_round_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_current_quiz_round(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_current_quiz_round(UUID) TO authenticated;

-- ===== RPC: submit an answer =====
-- Participant-only; the round must be the CURRENT one and still 'asking'. First
-- answer wins (lock-in via ON CONFLICT DO NOTHING). created_at is server-set.
CREATE FUNCTION public.submit_live_quiz_answer(p_session_id UUID, p_round_id UUID, p_answer TEXT)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_session public.live_sessions%ROWTYPE;
  v_status  TEXT;
  v_ins     INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO v_session FROM public.live_sessions s WHERE s.id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.live_participants p
                 WHERE p.session_id = p_session_id AND p.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Must be the current round and still open
  IF v_session.current_quiz_round_id IS DISTINCT FROM p_round_id THEN
    RAISE EXCEPTION 'round_closed';
  END IF;
  SELECT r.status INTO v_status FROM public.live_quiz_rounds r WHERE r.id = p_round_id;
  IF NOT FOUND OR v_status <> 'asking' THEN
    RAISE EXCEPTION 'round_closed';
  END IF;

  INSERT INTO public.live_quiz_answers (session_id, round_id, user_id, answer)
  VALUES (p_session_id, p_round_id, auth.uid(), p_answer)
  ON CONFLICT (session_id, round_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_ins = ROW_COUNT;
  IF v_ins > 0 THEN
    UPDATE public.live_quiz_rounds r
    SET answer_count = r.answer_count + 1
    WHERE r.id = p_round_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_live_quiz_answer(UUID, UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_live_quiz_answer(UUID, UUID, TEXT) TO authenticated;

-- ===== RPC: reveal a round (grade + score) =====
-- Host-only. Grades every answer (case/space-insensitive equality, matching the
-- async quiz) and assigns a speed-weighted score in [500,1000] for correct
-- answers (0 otherwise): faster correct answers score higher, with a 500 floor
-- so slow-but-right still scores. Idempotent if already revealed.
CREATE FUNCTION public.reveal_live_quiz_round(p_session_id UUID, p_round_id UUID)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_session public.live_sessions%ROWTYPE;
  v_round   public.live_quiz_rounds%ROWTYPE;
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

  SELECT * INTO v_round FROM public.live_quiz_rounds r
  WHERE r.id = p_round_id AND r.session_id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_round.status = 'revealed' THEN
    RETURN;  -- idempotent
  END IF;

  -- Grade + speed-weighted score in one pass
  UPDATE public.live_quiz_answers a
  SET is_correct = (lower(btrim(a.answer)) = lower(btrim(v_round.correct_answer))),
      score = CASE
        WHEN lower(btrim(a.answer)) = lower(btrim(v_round.correct_answer))
        THEN 500 + floor(500 * GREATEST(0, LEAST(1,
               (v_round.answer_window_sec - EXTRACT(EPOCH FROM (a.created_at - v_round.asked_at)))
               / NULLIF(v_round.answer_window_sec, 0))))::INTEGER
        ELSE 0 END
  WHERE a.round_id = p_round_id;

  UPDATE public.live_quiz_rounds r
  SET status = 'revealed', revealed_at = now()
  WHERE r.id = p_round_id;

  -- Re-touch the session so the pointer nudge fires (the pointer is unchanged)
  UPDATE public.live_sessions SET updated_at = now() WHERE id = p_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reveal_live_quiz_round(UUID, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reveal_live_quiz_round(UUID, UUID) TO authenticated;

-- ===== RPC: per-round answer distribution =====
-- Clones the get_live_tally gate: host anytime; the room only once the round is
-- revealed; else forbidden. LEFT JOIN over the choices so 0-count choices appear.
CREATE FUNCTION public.get_live_quiz_aggregate(p_round_id UUID)
RETURNS TABLE (answer_label TEXT, vote_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_round   public.live_quiz_rounds%ROWTYPE;
  v_session public.live_sessions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO v_round FROM public.live_quiz_rounds r WHERE r.id = p_round_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  SELECT * INTO v_session FROM public.live_sessions s WHERE s.id = v_round.session_id;

  IF v_session.host_id <> auth.uid() AND v_round.status <> 'revealed' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  -- A non-host must still be a member to read a revealed round's distribution
  IF v_session.host_id <> auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.live_participants p
                     WHERE p.session_id = v_round.session_id AND p.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_round.question_type = 'mcq' THEN
    RETURN QUERY
    SELECT ch.lbl, count(a.user_id)::BIGINT
    FROM (SELECT (e ->> 'label') AS lbl FROM jsonb_array_elements(v_round.options) e) ch
    LEFT JOIN public.live_quiz_answers a
      ON a.round_id = p_round_id AND lower(btrim(a.answer)) = lower(ch.lbl)
    GROUP BY ch.lbl
    ORDER BY ch.lbl;
  ELSE
    RETURN QUERY
    SELECT ch.lbl, count(a.user_id)::BIGINT
    FROM (VALUES ('true'), ('false')) AS ch(lbl)
    LEFT JOIN public.live_quiz_answers a
      ON a.round_id = p_round_id AND lower(btrim(a.answer)) = ch.lbl
    GROUP BY ch.lbl
    ORDER BY ch.lbl;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_live_quiz_aggregate(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_live_quiz_aggregate(UUID) TO authenticated;

-- ===== RPC: leaderboard =====
-- Host anytime; the room only when quiz_leaderboard_public AND at least one round
-- has been revealed. Aggregated per-user totals only — never per-question rows.
CREATE FUNCTION public.get_live_quiz_leaderboard(p_session_id UUID)
RETURNS TABLE (user_id UUID, display_name TEXT, total_score BIGINT, correct_count BIGINT)
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
    IF NOT v_session.quiz_leaderboard_public
       OR NOT EXISTS (SELECT 1 FROM public.live_quiz_rounds r
                      WHERE r.session_id = p_session_id AND r.status = 'revealed') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  RETURN QUERY
  SELECT p.user_id, p.display_name,
         COALESCE(sum(a.score), 0)::BIGINT,
         count(*) FILTER (WHERE a.is_correct)::BIGINT
  FROM public.live_participants p
  LEFT JOIN public.live_quiz_answers a
    ON a.session_id = p_session_id AND a.user_id = p.user_id
  WHERE p.session_id = p_session_id
  GROUP BY p.user_id, p.display_name
  ORDER BY COALESCE(sum(a.score), 0) DESC, p.display_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_live_quiz_leaderboard(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_live_quiz_leaderboard(UUID) TO authenticated;

-- ===== Realtime publication =====
-- Only the host watches live_quiz_answers (the high-volume table). The phone
-- path rides the existing live_sessions pointer nudge — live_quiz_rounds is NOT
-- published. Idempotent.

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE live_quiz_answers;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
