-- Hard Problem: Spotlight Draw RLS test harness + security checklist
-- ⚠ LOCAL TEST ONLY — never run against a real Supabase project.
-- Stubs the Supabase environment on a throwaway Postgres 16, runs 005 then 006,
-- then exercises the Sprint 2 security checklist. All assertions print PASS/FAIL.
-- Usage:
--   initdb + pg_ctl start a scratch cluster (or docker run postgres:16), then:
--   psql -f this_file   (it \i's both migrations itself)

-- ===== Test harness: stub Supabase on stock Postgres 16 =====

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE PUBLICATION supabase_realtime;

CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role         TEXT CHECK (role IN ('user', 'editor', 'admin')) DEFAULT 'user'
);
CREATE TABLE topics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  status            TEXT CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
  discussion_prompt TEXT NOT NULL DEFAULT ''
);
ALTER TABLE users  ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public user profiles" ON users FOR SELECT USING (true);
CREATE POLICY "Published topics visible to all" ON topics
  FOR SELECT USING (
    status = 'published'
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('editor', 'admin'))
  );
GRANT ALL ON users, topics TO anon, authenticated, service_role;

-- Seed: host + four voters, one published topic
INSERT INTO users (id, email, display_name) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'host@test.dev',    'Hosty'),
  ('00000000-0000-0000-0000-00000000000b', 'alice@test.dev',   'Alice'),
  ('00000000-0000-0000-0000-00000000000c', 'bob@test.dev',     'Bob'),
  ('00000000-0000-0000-0000-00000000000d', 'carol@test.dev',   'Carol'),
  ('00000000-0000-0000-0000-00000000000e', 'mallory@test.dev', 'Mallory');
INSERT INTO topics (id, title, slug, status, discussion_prompt) VALUES
  ('00000000-0000-0000-0000-000000000101', 'Trolley Problems at Scale', 'trolley', 'published', 'Would you pull the lever?');

-- ============ run both migrations ============
\i ../migrations/005_live_sessions.sql
\i ../migrations/006_spotlight_draw.sql

\set HOST    '00000000-0000-0000-0000-00000000000a'
\set ALICE   '00000000-0000-0000-0000-00000000000b'
\set BOB     '00000000-0000-0000-0000-00000000000c'
\set CAROL   '00000000-0000-0000-0000-00000000000d'
\set MALLORY '00000000-0000-0000-0000-00000000000e'
\set TOPIC   '00000000-0000-0000-0000-000000000101'
\set S1      '00000000-0000-0000-0000-000000000201'
\set OPT_A   '00000000-0000-0000-0000-000000000301'
\set OPT_B   '00000000-0000-0000-0000-000000000302'

\echo '=== Setup: host creates S1 with 2 options, opens voting; Alice/Bob/Carol join ==='
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
INSERT INTO live_sessions (id, code, topic_id, host_id, question)
VALUES (:'S1', 'ABCDEF', :'TOPIC', :'HOST', 'Pull the lever?');
INSERT INTO live_session_options (id, session_id, label, display_order) VALUES
  (:'OPT_A', :'S1', 'Pull it', 0),
  (:'OPT_B', :'S1', 'Do not pull', 1);

-- Alice/Bob/Carol join (default callable=true)
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
SELECT join_live_session(:'S1');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
SELECT join_live_session(:'S1');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', false);
SELECT join_live_session(:'S1', false);  -- Carol opts OUT of being callable

SELECT CASE WHEN callable = false THEN 'PASS: join snapshots callable=false' ELSE 'FAIL: ' || callable END
FROM live_participants WHERE user_id = :'CAROL';

-- Host opens voting; Alice+Bob vote majority (Pull it), Carol votes minority (Do not pull)
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
UPDATE live_sessions SET status = 'voting', updated_at = now() WHERE id = :'S1';
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
INSERT INTO live_responses (session_id, user_id, option_id, note) VALUES (:'S1', :'ALICE', :'OPT_A', 'five > one');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
INSERT INTO live_responses (session_id, user_id, option_id) VALUES (:'S1', :'BOB', :'OPT_A');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', false);
INSERT INTO live_responses (session_id, user_id, option_id, note) VALUES (:'S1', :'CAROL', :'OPT_B', 'dignity not arithmetic');

\echo '=== SP1: non-host cannot draw (forbidden) ==='
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
DO $$ BEGIN
  PERFORM * FROM draw_spotlight('00000000-0000-0000-0000-000000000201', 'uniform');
  RAISE NOTICE 'FAIL: non-host drew';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'forbidden' THEN RAISE NOTICE 'PASS: non-host draw forbidden';
  ELSE RAISE NOTICE 'FAIL: unexpected %', SQLERRM; END IF;
END $$;

\echo '=== SP2: uniform respects consent — Carol (callable=false) excluded, pool_size=2 ==='
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
SELECT CASE WHEN pool_size = 2 THEN 'PASS: uniform pool excludes opted-out Carol' ELSE 'FAIL: pool ' || pool_size END
FROM draw_spotlight(:'S1', 'uniform');

\echo '=== SP3: pointer set, draw row pending, get_current_spotlight is_you/note gating ==='
SELECT CASE WHEN current_spotlight_draw_id IS NOT NULL THEN 'PASS: pointer set' ELSE 'FAIL' END
FROM live_sessions WHERE id = :'S1';
-- The drawn user sees is_you=true and their own note; others see is_you=false, note NULL
DO $$
DECLARE v_drawn uuid; v_isyou boolean; v_note text;
BEGIN
  SELECT drawn_user_id INTO v_drawn FROM live_spotlight_draws
  WHERE session_id = '00000000-0000-0000-0000-000000000201' ORDER BY sequence DESC LIMIT 1;
  -- impersonate the drawn user
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_drawn)::text, false);
  SELECT is_you, drawn_note INTO v_isyou, v_note
  FROM get_current_spotlight('00000000-0000-0000-0000-000000000201');
  IF v_isyou THEN RAISE NOTICE 'PASS: drawn user is_you=true (note=%)', coalesce(v_note,'<none>');
  ELSE RAISE NOTICE 'FAIL: drawn user is_you=false'; END IF;
END $$;
-- A different participant (chosen dynamically — the draw is random): is_you=false, note hidden
DO $$
DECLARE v_drawn uuid; v_other uuid; v_isyou boolean; v_note text;
BEGIN
  -- Gather identities AS THE HOST (a participant's RLS can't see other rows)
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
  SELECT drawn_user_id INTO v_drawn FROM live_spotlight_draws
  WHERE session_id = '00000000-0000-0000-0000-000000000201' ORDER BY sequence DESC LIMIT 1;
  SELECT user_id INTO v_other FROM live_participants
  WHERE session_id = '00000000-0000-0000-0000-000000000201' AND user_id <> v_drawn LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, false);
  SELECT is_you, drawn_note INTO v_isyou, v_note
  FROM get_current_spotlight('00000000-0000-0000-0000-000000000201');
  IF v_isyou = false AND v_note IS NULL THEN RAISE NOTICE 'PASS: other sees is_you=false, note hidden';
  ELSE RAISE NOTICE 'FAIL: isyou=% note=%', v_isyou, coalesce(v_note, 'NULL'); END IF;
END $$;

\echo '=== SP4: column pin — host cannot rewrite drawn_user_id / pointer / cycle / raffle_mode ==='
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
DO $$ BEGIN
  UPDATE live_spotlight_draws SET drawn_user_id = '00000000-0000-0000-0000-00000000000a'
  WHERE session_id = '00000000-0000-0000-0000-000000000201';
  RAISE NOTICE 'FAIL: host rewrote drawn_user_id (RIG)';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: drawn_user_id column-pinned'; END $$;
DO $$ BEGIN
  UPDATE live_sessions SET current_spotlight_draw_id = NULL WHERE id = '00000000-0000-0000-0000-000000000201';
  RAISE NOTICE 'FAIL: host raw-wrote pointer';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: pointer column-pinned (RPC-only)'; END $$;
DO $$ BEGIN
  UPDATE live_sessions SET spotlight_cycle = 99 WHERE id = '00000000-0000-0000-0000-000000000201';
  RAISE NOTICE 'FAIL: host raw-wrote spotlight_cycle';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: spotlight_cycle column-pinned'; END $$;
DO $$ BEGIN
  UPDATE live_sessions SET raffle_mode = true WHERE id = '00000000-0000-0000-0000-000000000201';
  RAISE NOTICE 'FAIL: host flipped raffle_mode mid-session';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: raffle_mode immutable'; END $$;

\echo '=== SP5: only the drawn user may pass; a non-drawn participant cannot ==='
-- Bob (not the drawn user in SP2, since Carol is excluded the draw was Alice or Bob)
DO $$
DECLARE v_drawn uuid; v_draw uuid; v_other uuid;
BEGIN
  SELECT drawn_user_id, id INTO v_drawn, v_draw FROM live_spotlight_draws
  WHERE session_id = '00000000-0000-0000-0000-000000000201' ORDER BY sequence DESC LIMIT 1;
  -- pick a participant who is NOT the drawn user
  SELECT user_id INTO v_other FROM live_participants
  WHERE session_id = '00000000-0000-0000-0000-000000000201' AND user_id <> v_drawn LIMIT 1;
  -- the non-drawn participant tries to pass the drawn user's row
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, false);
  BEGIN
    UPDATE live_spotlight_draws SET outcome = 'passed', resolved_at = now() WHERE id = v_draw;
    IF FOUND THEN RAISE NOTICE 'FAIL: non-drawn user passed someone else''s draw';
    ELSE RAISE NOTICE 'PASS: non-drawn pass affected 0 rows (RLS)'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: non-drawn pass rejected'; END;
  -- the drawn user passes their own row
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_drawn)::text, false);
  UPDATE live_spotlight_draws SET outcome = 'passed', resolved_at = now() WHERE id = v_draw;
  IF FOUND THEN RAISE NOTICE 'PASS: drawn user passed own draw'; ELSE RAISE NOTICE 'FAIL: drawn pass 0 rows'; END IF;
END $$;

\echo '=== SP5b: passed draw — name hidden from other members server-side, shown to the drawn user ==='
DO $$
DECLARE v_drawn uuid; v_other uuid; v_name_other text; v_name_self text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
  SELECT drawn_user_id INTO v_drawn FROM live_spotlight_draws
  WHERE session_id = '00000000-0000-0000-0000-000000000201' AND outcome = 'passed' ORDER BY sequence DESC LIMIT 1;
  SELECT user_id INTO v_other FROM live_participants
  WHERE session_id = '00000000-0000-0000-0000-000000000201' AND user_id <> v_drawn LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, false);
  SELECT drawn_display_name INTO v_name_other FROM get_current_spotlight('00000000-0000-0000-0000-000000000201');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_drawn)::text, false);
  SELECT drawn_display_name INTO v_name_self FROM get_current_spotlight('00000000-0000-0000-0000-000000000201');
  IF v_name_other IS NULL AND v_name_self IS NOT NULL THEN
    RAISE NOTICE 'PASS: passed-draw name hidden from others, shown to self';
  ELSE RAISE NOTICE 'FAIL: other=% self=%', coalesce(v_name_other, 'NULL'), coalesce(v_name_self, 'NULL'); END IF;
END $$;

\echo '=== SP6: outcome is terminal — passed cannot move to shared (trigger) ==='
DO $$
DECLARE v_draw uuid; v_drawn uuid;
BEGIN
  SELECT id, drawn_user_id INTO v_draw, v_drawn FROM live_spotlight_draws
  WHERE session_id = '00000000-0000-0000-0000-000000000201' AND outcome = 'passed' ORDER BY sequence DESC LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_drawn)::text, false);
  BEGIN
    UPDATE live_spotlight_draws SET outcome = 'shared' WHERE id = v_draw;
    RAISE NOTICE 'FAIL: passed->shared accepted';
  EXCEPTION
    WHEN raise_exception THEN RAISE NOTICE 'PASS: terminal outcome (trigger blocks passed->shared)';
    WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: terminal (blocked, no longer current spotlight)';
  END;
END $$;

\echo '=== SP7: drawn user cannot self-set cleared (WITH CHECK pins to shared/passed) ==='
-- Re-draw so there is a fresh pending spotlight owned by someone
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
SELECT 'redraw seq ' || sequence FROM draw_spotlight(:'S1', 'uniform');
DO $$
DECLARE v_draw uuid; v_drawn uuid;
BEGIN
  SELECT current_spotlight_draw_id INTO v_draw FROM live_sessions WHERE id = '00000000-0000-0000-0000-000000000201';
  SELECT drawn_user_id INTO v_drawn FROM live_spotlight_draws WHERE id = v_draw;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_drawn)::text, false);
  BEGIN
    UPDATE live_spotlight_draws SET outcome = 'cleared' WHERE id = v_draw;
    RAISE NOTICE 'FAIL: drawn user self-cleared';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: self-clear blocked by WITH CHECK'; END;
END $$;

\echo '=== SP8: clear_spotlight is host-only; nulls pointer; cleared does not block re-draw ==='
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
DO $$ BEGIN
  PERFORM clear_spotlight('00000000-0000-0000-0000-000000000201');
  RAISE NOTICE 'FAIL: non-host cleared';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'forbidden' THEN RAISE NOTICE 'PASS: non-host clear forbidden';
  ELSE RAISE NOTICE 'FAIL: unexpected %', SQLERRM; END IF;
END $$;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
SELECT clear_spotlight(:'S1');
SELECT CASE WHEN current_spotlight_draw_id IS NULL THEN 'PASS: pointer cleared' ELSE 'FAIL' END
FROM live_sessions WHERE id = :'S1';

\echo '=== SP9: minority modes — steelman draws a minority voter; no_minority on a vote-less session ==='
-- Carol is the only minority voter (Do not pull) but she is callable=false.
-- Make her callable so steelman has a pool.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', false);
UPDATE live_participants SET callable = true WHERE user_id = :'CAROL';
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
SELECT CASE WHEN drawn_display_name = 'Carol' THEN 'PASS: steelman drew the minority voter'
            ELSE 'FAIL: drew ' || drawn_display_name END
FROM draw_spotlight(:'S1', 'minority_steelman');
SELECT clear_spotlight(:'S1');
-- A second session with zero votes → no_minority
INSERT INTO live_sessions (id, code, topic_id, host_id, question)
VALUES ('00000000-0000-0000-0000-000000000202', 'NVTES2', :'TOPIC', :'HOST', 'Q?');
INSERT INTO live_session_options (session_id, label, display_order) VALUES
  ('00000000-0000-0000-0000-000000000202', 'X', 0), ('00000000-0000-0000-0000-000000000202', 'Y', 1);
UPDATE live_sessions SET status = 'voting', updated_at = now() WHERE id = '00000000-0000-0000-0000-000000000202';
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
SELECT join_live_session('00000000-0000-0000-0000-000000000202');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
DO $$ BEGIN
  PERFORM * FROM draw_spotlight('00000000-0000-0000-0000-000000000202', 'minority_weighted');
  RAISE NOTICE 'FAIL: minority mode on vote-less session drew';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'no_minority' THEN RAISE NOTICE 'PASS: no_minority on vote-less session';
  ELSE RAISE NOTICE 'FAIL: unexpected %', SQLERRM; END IF;
END $$;

\echo '=== SP10: no_repeat — pool exhausts at N distinct, then cycle bumps and re-pools ==='
INSERT INTO live_sessions (id, code, topic_id, host_id, question)
VALUES ('00000000-0000-0000-0000-000000000203', 'CYKES2', :'TOPIC', :'HOST', 'Q?');
UPDATE live_sessions SET status = 'voting', updated_at = now() WHERE id = '00000000-0000-0000-0000-000000000203';
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
SELECT join_live_session('00000000-0000-0000-0000-000000000203');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
SELECT join_live_session('00000000-0000-0000-0000-000000000203');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
DO $$
DECLARE i int; u uuid; seen uuid[] := '{}'; c0 int; c1 int; distinct_in_cycle int := 0;
BEGIN
  SELECT spotlight_cycle INTO c0 FROM live_sessions WHERE id = '00000000-0000-0000-0000-000000000203';
  -- two participants, no clearing: the first two draws must be distinct...
  FOR i IN 1..2 LOOP
    PERFORM draw_spotlight('00000000-0000-0000-0000-000000000203', 'no_repeat');
    SELECT drawn_user_id INTO u FROM live_spotlight_draws
    WHERE session_id = '00000000-0000-0000-0000-000000000203' ORDER BY sequence DESC LIMIT 1;
    IF NOT (u = ANY(seen)) THEN distinct_in_cycle := distinct_in_cycle + 1; END IF;
    seen := seen || u;
  END LOOP;
  -- ...the third exhausts the pool → cycle bumps (re-pools), never raises
  PERFORM draw_spotlight('00000000-0000-0000-0000-000000000203', 'no_repeat');
  SELECT spotlight_cycle INTO c1 FROM live_sessions WHERE id = '00000000-0000-0000-0000-000000000203';
  IF distinct_in_cycle = 2 AND c1 = c0 + 1 THEN
    RAISE NOTICE 'PASS: pool exhausted at 2 distinct, cycle bumped % -> %', c0, c1;
  ELSE RAISE NOTICE 'FAIL: distinct=% c0=% c1=%', distinct_in_cycle, c0, c1; END IF;
END $$;

\echo '=== SP11: cross-session isolation — Mallory cannot read S1 draws or its current spotlight ==='
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
SELECT * FROM draw_spotlight(:'S1', 'uniform') LIMIT 1;  -- ensure a current spotlight exists
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', false);
SELECT CASE WHEN count(*) = 0 THEN 'PASS: non-member sees zero draw rows' ELSE 'FAIL: ' || count(*) END
FROM live_spotlight_draws WHERE session_id = :'S1';
DO $$ BEGIN
  PERFORM * FROM get_current_spotlight('00000000-0000-0000-0000-000000000201');
  RAISE NOTICE 'FAIL: non-member read current spotlight';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'forbidden' THEN RAISE NOTICE 'PASS: non-member current-spotlight forbidden';
  ELSE RAISE NOTICE 'FAIL: unexpected %', SQLERRM; END IF;
END $$;

\echo '=== SP12: get_spotlight_history is host-only; participant forbidden ==='
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
DO $$ BEGIN
  PERFORM * FROM get_spotlight_history('00000000-0000-0000-0000-000000000201');
  RAISE NOTICE 'FAIL: participant read history';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'forbidden' THEN RAISE NOTICE 'PASS: participant history forbidden';
  ELSE RAISE NOTICE 'FAIL: unexpected %', SQLERRM; END IF;
END $$;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
SELECT CASE WHEN count(*) = 3 THEN 'PASS: host history lists all 3 participants (roster)' ELSE 'FAIL: ' || count(*) END
FROM get_spotlight_history(:'S1');

\echo '=== SP13: draw rejected once the session has ended (session_closed) ==='
UPDATE live_sessions SET status = 'revealed', updated_at = now() WHERE id = :'S1';
UPDATE live_sessions SET status = 'ended', ended_at = now(), updated_at = now() WHERE id = :'S1';
DO $$ BEGIN
  PERFORM * FROM draw_spotlight('00000000-0000-0000-0000-000000000201', 'uniform');
  RAISE NOTICE 'FAIL: drew on ended session';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'session_closed' THEN RAISE NOTICE 'PASS: draw on ended session rejected';
  ELSE RAISE NOTICE 'FAIL: unexpected %', SQLERRM; END IF;
END $$;

\echo '=== SP14: anon fully locked out of every spotlight RPC ==='
RESET request.jwt.claims;
SET ROLE anon;
DO $$ BEGIN
  PERFORM * FROM draw_spotlight('00000000-0000-0000-0000-000000000201', 'uniform');
  RAISE NOTICE 'FAIL: anon drew';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon cannot draw_spotlight'; END $$;
DO $$ BEGIN
  PERFORM * FROM get_current_spotlight('00000000-0000-0000-0000-000000000201');
  RAISE NOTICE 'FAIL: anon read spotlight';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon cannot get_current_spotlight'; END $$;
DO $$ BEGIN
  PERFORM clear_spotlight('00000000-0000-0000-0000-000000000201');
  RAISE NOTICE 'FAIL: anon cleared';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon cannot clear_spotlight'; END $$;
RESET ROLE;

\echo '=== done ==='
