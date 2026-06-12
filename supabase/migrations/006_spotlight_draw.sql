-- Hard Problem: Spotlight Draw (Sprint 2 — host draws a participant to call on)
-- Run after 005_live_sessions.sql in the Supabase SQL editor.
-- Spec: docs/sprint-2-spotlight-draw.md.
--
-- Design (locked decisions):
--  * Drawing is ORTHOGONAL to the lobby→voting⇄revealed→ended machine — no new
--    status, enforce_live_session_transition() is untouched. A session can be
--    'voting' AND have a live spotlight at once (minority-steelman wants both).
--  * live_spotlight_draws (one row per draw) is the source of truth + history +
--    no-repeat ledger. A pointer column live_sessions.current_spotlight_draw_id
--    is the realtime NUDGE — phones already watch the session row, so the
--    spotlight needs ZERO new phone subscriptions.
--  * Randomness lives ONLY inside draw_spotlight() (SECURITY DEFINER). The host
--    passes a mode, never a winner; drawn_user_id is column-pinned immutable.
--  * The pointer + cycle columns are written ONLY by the definer RPCs (NOT in the
--    authenticated GRANT) — a host cannot re-point or invent a winner via PostgREST.

-- ===== Schema: live_sessions spotlight columns =====
-- raffle_mode: tender pure-raffle skin (uniform-only, consent ignored). Set at
--   create; NOT granted for UPDATE, so it is immutable like code/question.
-- current_spotlight_draw_id: the low-volume nudge pointer phones already watch.
-- spotlight_cycle: monotonic no-repeat cycle; bumped by the RPC on exhaustion.

ALTER TABLE live_sessions
  ADD COLUMN raffle_mode               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN current_spotlight_draw_id UUID,
  ADD COLUMN spotlight_cycle           INTEGER NOT NULL DEFAULT 0;

-- ===== Schema: live_participants consent =====
-- callable: ambient opt-OUT (default true). Named draw modes only pick callable
-- participants; raffle_mode ignores it (door-prize implicit consent).
-- Self-declared preference, so the client may supply it (snapshotted at join,
-- toggleable via the consent UPDATE policy below).

ALTER TABLE live_participants
  ADD COLUMN callable BOOLEAN NOT NULL DEFAULT true;

-- ===== Live Spotlight Draws =====
-- LOW volume — one row per draw. Source of truth, history, and no-repeat ledger.

CREATE TABLE live_spotlight_draws (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  cycle              INTEGER NOT NULL,  -- == live_sessions.spotlight_cycle at draw time
  sequence           INTEGER NOT NULL,  -- monotonic 1..N per session (history order)
  mode               TEXT NOT NULL CHECK (mode IN ('uniform', 'no_repeat', 'minority_weighted', 'minority_steelman')),
  minority_option_id UUID REFERENCES live_session_options(id) ON DELETE RESTRICT,  -- modes c/d provenance
  drawn_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- a draw must not be orphaned
  display_name       TEXT NOT NULL,  -- snapshotted server-side; never client-supplied
  pool_size          INTEGER NOT NULL,  -- |eligible pool| at draw time, for the odds readout
  outcome            TEXT NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending', 'shared', 'passed', 'cleared')),
  note_shared        BOOLEAN NOT NULL DEFAULT false,  -- drawn user opted to project their note
  created_at         TIMESTAMPTZ DEFAULT now(),
  resolved_at        TIMESTAMPTZ,
  UNIQUE (session_id, sequence)
);

CREATE INDEX idx_live_spotlight_draws_session ON live_spotlight_draws(session_id);
CREATE INDEX idx_live_spotlight_draws_cycle   ON live_spotlight_draws(session_id, cycle);

-- The pointer FK is added after the table exists (avoids the create-order cycle).
ALTER TABLE live_sessions
  ADD CONSTRAINT fk_live_sessions_spotlight
  FOREIGN KEY (current_spotlight_draw_id) REFERENCES live_spotlight_draws(id) ON DELETE SET NULL;

-- ===== Row-Level Security =====

ALTER TABLE live_spotlight_draws ENABLE ROW LEVEL SECURITY;

-- A participant reads only draws naming THEM; the host reads all. The PUBLIC
-- current-spotlight name reaches the room ONLY through get_current_spotlight()
-- (definer) — never a direct table SELECT — so no one can enumerate the draw
-- table or learn who else was eligible. Mirrors live_participants visibility.
CREATE POLICY "Own draw and host visibility" ON live_spotlight_draws
  FOR SELECT USING (
    drawn_user_id = auth.uid() OR public.is_live_session_host(session_id)
  );

-- No INSERT policy — draws are created exclusively by draw_spotlight() (definer),
-- mirroring live_participants (joins only via join_live_session).

-- Pass / Share are the drawn participant's own acts (consent withdrawal must be
-- theirs alone — NOT a host RPC). Gated to the CURRENT spotlight so an old draw
-- row can't be retroactively flipped. Outer columns are qualified
-- (live_spotlight_draws.session_id / .id) — the tautology guard.
CREATE POLICY "Drawn user resolves own draw" ON live_spotlight_draws
  FOR UPDATE USING (
    drawn_user_id = auth.uid()
    AND (SELECT current_spotlight_draw_id FROM live_sessions
         WHERE id = live_spotlight_draws.session_id) = live_spotlight_draws.id
  )
  WITH CHECK (
    drawn_user_id = auth.uid()
    AND outcome IN ('shared', 'passed')  -- never self-set to pending/cleared
  );

-- Column pin (the anti-rig core, clone of 005's question/code pin): drawn_user_id
-- / mode / sequence / cycle / minority_option_id / pool_size are PHYSICALLY
-- immutable post-insert by any non-definer caller. A host cannot hand-pick a
-- winner by direct PostgREST write — it surfaces as 42501.
REVOKE UPDATE ON live_spotlight_draws FROM authenticated, anon;
GRANT UPDATE (outcome, note_shared, resolved_at) ON live_spotlight_draws TO authenticated;

-- live_sessions: the new spotlight columns are deliberately NOT added to the
-- authenticated UPDATE grant (005 granted only status/updated_at/ended_at). The
-- pointer + cycle are written ONLY inside the definer RPCs; raffle_mode is
-- create-time immutable. New columns inherit no grant, so this is automatic —
-- documented here so a future migration doesn't accidentally re-grant them.

-- live_participants: let a participant toggle their OWN consent bit, and pin
-- everything else (display_name stays server-only).
CREATE POLICY "Participant updates own consent" ON live_participants
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE UPDATE ON live_participants FROM authenticated, anon;
GRANT UPDATE (callable) ON live_participants TO authenticated;

-- ===== Trigger: spotlight outcome machine =====
-- pending → {shared, passed, cleared}; shared/passed/cleared are terminal.
-- Same-outcome updates pass (no-op). Mirrors enforce_live_session_transition.

CREATE FUNCTION public.enforce_live_spotlight_transition()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.outcome = OLD.outcome THEN
    RETURN NEW;
  END IF;
  IF OLD.outcome = 'pending' AND NEW.outcome IN ('shared', 'passed', 'cleared') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid spotlight transition % -> %', OLD.outcome, NEW.outcome;
END;
$$;

CREATE TRIGGER live_spotlight_transition
  BEFORE UPDATE OF outcome ON live_spotlight_draws
  FOR EACH ROW EXECUTE FUNCTION public.enforce_live_spotlight_transition();

-- ===== RPC: draw =====
-- Called from tRPC live.draw. Host-only, server-authoritative randomness: the
-- host passes only a mode (never a winner). Weighted reservoir via the A-Res key
-- power(random(), 1/w) — selection probability is EXACTLY proportional to w in a
-- single pass (a naive ORDER BY random()*w is NOT proportional). Snapshots
-- display_name + pool_size server-side, inserts the draw, then flips the pointer
-- (the realtime nudge) in the same transaction.
--   modes: uniform (w=1, repeats OK — the pure raffle); no_repeat (w=1, exclude
--   anyone already drawn this cycle); minority_weighted (minority voters 3x);
--   minority_steelman (pool restricted to minority voters). no_repeat exclusion
--   also folds into the minority modes. p_exclude_user_id drops the just-passed
--   person on a re-draw (before their row even commits to 'passed').
CREATE FUNCTION public.draw_spotlight(
  p_session_id      UUID,
  p_mode            TEXT,
  p_exclude_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  draw_id            UUID,
  drawn_display_name TEXT,
  mode               TEXT,
  sequence           INTEGER,
  pool_size          INTEGER
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_session           public.live_sessions%ROWTYPE;
  v_minority          UUID;
  v_respect_no_repeat BOOLEAN;
  v_respect_consent   BOOLEAN;
  v_eff_cycle         INTEGER;
  v_did_reset         BOOLEAN := FALSE;
  v_user              UUID;
  v_name              TEXT;
  v_pool              INTEGER;
  v_seq               INTEGER;
  v_draw_id           UUID;
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
  IF p_mode NOT IN ('uniform', 'no_repeat', 'minority_weighted', 'minority_steelman') THEN
    RAISE EXCEPTION 'bad_mode';
  END IF;

  v_respect_consent   := NOT v_session.raffle_mode;
  v_respect_no_repeat := (p_mode <> 'uniform');

  -- Minority option = smallest strictly-positive vote count; ties → lowest
  -- display_order (deterministic). NULL only when nobody has voted.
  IF p_mode IN ('minority_weighted', 'minority_steelman') THEN
    SELECT o.id INTO v_minority
    FROM public.live_session_options o
    JOIN public.live_responses r
      ON r.option_id = o.id AND r.session_id = o.session_id AND r.round_number = 1
    WHERE o.session_id = p_session_id
    GROUP BY o.id, o.display_order
    ORDER BY count(r.user_id) ASC, o.display_order ASC
    LIMIT 1;
    IF v_minority IS NULL THEN
      RAISE EXCEPTION 'no_minority';
    END IF;
  END IF;

  v_eff_cycle := v_session.spotlight_cycle;

  -- Draw once; if a no-repeat pool is exhausted, bump the cycle and retry once.
  LOOP
    SELECT e.user_id, e.display_name, count(*) OVER ()
    INTO v_user, v_name, v_pool
    FROM (
      SELECT p.user_id, p.display_name,
             power(random(),
                   1.0 / CASE
                     WHEN p_mode = 'minority_weighted'
                          AND EXISTS (SELECT 1 FROM public.live_responses r
                                      WHERE r.session_id = p_session_id AND r.user_id = p.user_id
                                        AND r.round_number = 1 AND r.option_id = v_minority)
                     THEN 3.0 ELSE 1.0 END) AS sort_key
      FROM public.live_participants p
      WHERE p.session_id = p_session_id
        AND (NOT v_respect_consent OR p.callable = TRUE)
        AND (p_exclude_user_id IS NULL OR p.user_id <> p_exclude_user_id)
        AND (p_mode <> 'minority_steelman'
             OR EXISTS (SELECT 1 FROM public.live_responses r
                        WHERE r.session_id = p_session_id AND r.user_id = p.user_id
                          AND r.round_number = 1 AND r.option_id = v_minority))
        AND (NOT v_respect_no_repeat
             OR NOT EXISTS (SELECT 1 FROM public.live_spotlight_draws d
                            WHERE d.session_id = p_session_id AND d.cycle = v_eff_cycle
                              AND d.drawn_user_id = p.user_id
                              AND d.outcome IN ('pending', 'shared', 'passed')))
    ) e
    ORDER BY e.sort_key DESC
    LIMIT 1;

    EXIT WHEN v_user IS NOT NULL;
    IF v_respect_no_repeat AND NOT v_did_reset THEN
      v_eff_cycle := v_eff_cycle + 1;  -- everyone called this cycle → reset
      v_did_reset := TRUE;
      CONTINUE;
    END IF;
    EXIT;
  END LOOP;

  IF v_user IS NULL THEN
    IF p_mode = 'minority_steelman' THEN
      RAISE EXCEPTION 'no_minority_voters';
    ELSE
      RAISE EXCEPTION 'no_eligible_participants';
    END IF;
  END IF;

  SELECT COALESCE(max(d.sequence), 0) + 1 INTO v_seq
  FROM public.live_spotlight_draws d WHERE d.session_id = p_session_id;

  INSERT INTO public.live_spotlight_draws
    (session_id, cycle, sequence, mode, minority_option_id, drawn_user_id, display_name, pool_size, outcome)
  VALUES
    (p_session_id, v_eff_cycle, v_seq, p_mode, v_minority, v_user, v_name, v_pool, 'pending')
  RETURNING id INTO v_draw_id;

  UPDATE public.live_sessions
  SET current_spotlight_draw_id = v_draw_id,
      spotlight_cycle = v_eff_cycle,
      updated_at = now()
  WHERE id = p_session_id;

  RETURN QUERY SELECT v_draw_id, v_name, p_mode, v_seq, v_pool;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.draw_spotlight(UUID, TEXT, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.draw_spotlight(UUID, TEXT, UUID) TO authenticated;

-- ===== RPC: current spotlight =====
-- Called from tRPC live.currentSpotlight — the read every screen refetches on
-- the nudge. Membership-gated (host or participant of THIS session). is_you is
-- evaluated server-side (a phone cannot spoof it). The drawn note is returned
-- to the drawn user always (recall-your-own-note) and to others only once the
-- drawn user opted to share it on screen (note_shared).
CREATE FUNCTION public.get_current_spotlight(p_session_id UUID)
RETURNS TABLE (
  draw_id            UUID,
  drawn_display_name TEXT,
  mode               TEXT,
  outcome            TEXT,
  note_shared        BOOLEAN,
  is_you             BOOLEAN,
  drawn_note         TEXT,
  pool_size          INTEGER
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

  IF v_session.host_id <> auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.live_participants p
                     WHERE p.session_id = p_session_id AND p.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_session.current_spotlight_draw_id IS NULL THEN
    RETURN;  -- empty set: no active spotlight
  END IF;

  RETURN QUERY
  SELECT d.id,
         -- A pass is never surfaced by NAME to the room (silent-pass consent):
         -- blank the name for passed/cleared draws to everyone but the drawn user
         CASE WHEN d.outcome IN ('passed', 'cleared') AND d.drawn_user_id <> auth.uid()
              THEN NULL ELSE d.display_name END,
         d.mode, d.outcome, d.note_shared,
         d.drawn_user_id = auth.uid(),
         CASE WHEN d.drawn_user_id = auth.uid() OR d.note_shared
              THEN (SELECT r.note FROM public.live_responses r
                    WHERE r.session_id = p_session_id AND r.user_id = d.drawn_user_id
                      AND r.round_number = 1)
              ELSE NULL END,
         d.pool_size
  FROM public.live_spotlight_draws d
  WHERE d.id = v_session.current_spotlight_draw_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_current_spotlight(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_current_spotlight(UUID) TO authenticated;

-- ===== RPC: clear spotlight =====
-- Called from tRPC live.clearDraw. Host-only. Resolves a still-pending draw to
-- 'cleared' (a host mulligan — cleared draws do NOT consume the no-repeat pool)
-- and nulls the pointer. A draw the participant already resolved keeps its
-- outcome; only the pointer is cleared.
CREATE FUNCTION public.clear_spotlight(p_session_id UUID)
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

  IF v_session.current_spotlight_draw_id IS NOT NULL THEN
    UPDATE public.live_spotlight_draws
    SET outcome = 'cleared', resolved_at = now()
    WHERE id = v_session.current_spotlight_draw_id AND outcome = 'pending';

    UPDATE public.live_sessions
    SET current_spotlight_draw_id = NULL, updated_at = now()
    WHERE id = p_session_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_spotlight(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.clear_spotlight(UUID) TO authenticated;

-- ===== RPC: spotlight history =====
-- Called from tRPC live.drawHistory. Host-only (RAISE 'forbidden' like the
-- tally). LEFT JOIN keeps never-drawn participants present (draw_count 0) — this
-- IS the no-repeat "already-called" roster made visible.
CREATE FUNCTION public.get_spotlight_history(p_session_id UUID)
RETURNS TABLE (
  user_id           UUID,
  display_name      TEXT,
  draw_count        BIGINT,
  last_outcome      TEXT,
  last_sequence     INTEGER,
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
  IF v_session.host_id <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT p.user_id, p.display_name,
         count(d.id)::BIGINT,
         (SELECT d2.outcome FROM public.live_spotlight_draws d2
          WHERE d2.session_id = p_session_id AND d2.drawn_user_id = p.user_id
          ORDER BY d2.sequence DESC LIMIT 1),
         (SELECT d2.sequence FROM public.live_spotlight_draws d2
          WHERE d2.session_id = p_session_id AND d2.drawn_user_id = p.user_id
          ORDER BY d2.sequence DESC LIMIT 1),
         (SELECT count(*) FROM public.live_participants pp
          WHERE pp.session_id = p_session_id)::BIGINT
  FROM public.live_participants p
  LEFT JOIN public.live_spotlight_draws d
    ON d.session_id = p.session_id AND d.drawn_user_id = p.user_id
  WHERE p.session_id = p_session_id
  GROUP BY p.user_id, p.display_name
  ORDER BY count(d.id) DESC, p.display_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_spotlight_history(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_spotlight_history(UUID) TO authenticated;

-- ===== RPC: join (extended with consent snapshot) =====
-- Replaces the 005 join_live_session(UUID) with a (UUID, BOOLEAN) signature so
-- the join can snapshot the caller's callable preference. Dropping the old
-- single-arg function avoids an overload ambiguity with the new default arg.

DROP FUNCTION public.join_live_session(UUID);

CREATE FUNCTION public.join_live_session(p_session_id UUID, p_callable BOOLEAN DEFAULT true)
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
    RAISE EXCEPTION 'profile_missing';
  END IF;

  INSERT INTO public.live_participants (session_id, user_id, display_name, callable)
  VALUES (p_session_id, auth.uid(), v_display_name, COALESCE(p_callable, true))
  ON CONFLICT (session_id, user_id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_live_session(UUID, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.join_live_session(UUID, BOOLEAN) TO authenticated;

-- ===== Realtime publication =====
-- The phone path needs NO new publication: the spotlight nudge rides the
-- existing live_sessions UPDATE (current_spotlight_draw_id flips on every draw/
-- clear). This adds live_spotlight_draws only for the OPTIONAL host-only history
-- channel (instant history + note_shared refresh). Phones never subscribe to it.
-- Idempotent: the table may already have been added via the dashboard (42710).

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE live_spotlight_draws;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
