-- Hard Problem: Live Sessions RLS test harness + security checklist
-- ⚠ LOCAL TEST ONLY — never run against a real Supabase project.
-- Stubs the Supabase environment (roles, auth.uid(), publication, minimal
-- users/topics) on a throwaway Postgres 16, then runs the §9 checklist
-- from docs/sprint-1-live-sessions.md against 005_live_sessions.sql.
-- Usage:
--   initdb + pg_ctl start a scratch cluster (or docker run postgres:16), then:
--   psql -f this_file_part1(harness) -f ../migrations/005_live_sessions.sql -f this_file_part2(checklist)
-- All assertions print PASS/FAIL.

-- Test harness: stub the Supabase environment on stock Postgres 16
-- so 005_live_sessions.sql can run verbatim and RLS can be exercised
-- with role/JWT impersonation.

-- Roles (Supabase pre-creates these)
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Supabase default privileges: all tables granted to the API roles (RLS gates rows)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- auth schema stub: auth.uid() reads the per-request JWT claims GUC,
-- exactly like Supabase's implementation.
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- The publication 005 alters (pre-exists on hosted Supabase)
CREATE PUBLICATION supabase_realtime;

-- Minimal prerequisite tables from 001 (only what 005 references), with their
-- real RLS policies so policy subqueries behave as in production.
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

-- Seed: three users, one published + one draft topic
INSERT INTO users (id, email, display_name) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'host@test.dev',     'Hosty'),
  ('00000000-0000-0000-0000-00000000000b', 'alice@test.dev',    'Alice'),
  ('00000000-0000-0000-0000-00000000000c', 'mallory@test.dev',  'Mallory');
INSERT INTO topics (id, title, slug, status, discussion_prompt) VALUES
  ('00000000-0000-0000-0000-000000000101', 'Trolley Problems at Scale', 'trolley', 'published', 'Would you pull the lever?'),
  ('00000000-0000-0000-0000-000000000102', 'Secret Draft Topic', 'draft-topic', 'draft', 'hidden');

-- ============ run supabase/migrations/005_live_sessions.sql here ============
\i ../migrations/005_live_sessions.sql

-- §9 security checklist as executable SQL. Each test prints PASS/FAIL.
-- Impersonation helper: SET ROLE authenticated + request.jwt.claims sub.

\set HOST '00000000-0000-0000-0000-00000000000a'
\set ALICE '00000000-0000-0000-0000-00000000000b'
\set MALLORY '00000000-0000-0000-0000-00000000000c'
\set TOPIC '00000000-0000-0000-0000-000000000101'
\set DRAFT '00000000-0000-0000-0000-000000000102'

\echo '=== Setup: host creates session S1 (INSERT ... RETURNING must work — the v1.1 blocker) ==='
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
INSERT INTO live_sessions (id, code, topic_id, host_id, question)
VALUES ('00000000-0000-0000-0000-000000000201', 'ABCDEF', :'TOPIC', :'HOST', 'Pull the lever?')
RETURNING 'PASS: create returning works' AS t1, id, code;

INSERT INTO live_session_options (id, session_id, label, display_order) VALUES
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', 'Pull it', 0),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000201', 'Do not pull', 1)
RETURNING 'PASS: host inserts options' AS t2, label;

\echo '=== T3: session cannot be born revealed ==='
DO $$ BEGIN
  INSERT INTO live_sessions (code, topic_id, host_id, status)
  VALUES ('BORNRV', '00000000-0000-0000-0000-000000000101',
          '00000000-0000-0000-0000-00000000000a', 'revealed');
  RAISE NOTICE 'FAIL: born-revealed session accepted';
EXCEPTION WHEN insufficient_privilege OR check_violation THEN
  RAISE NOTICE 'PASS: born-revealed rejected (%)', SQLERRM;
END $$;

\echo '=== T4: cannot host on a draft (invisible) topic ==='
DO $$ BEGIN
  INSERT INTO live_sessions (code, topic_id, host_id)
  VALUES ('DRAFTX', '00000000-0000-0000-0000-000000000102',
          '00000000-0000-0000-0000-00000000000a');
  RAISE NOTICE 'FAIL: draft-topic session accepted';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: draft-topic session rejected';
END $$;

\echo '=== T5: Mallory (non-member) cannot enumerate sessions/options/codes ==='
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
SELECT CASE WHEN count(*) = 0 THEN 'PASS: zero sessions visible' ELSE 'FAIL: ' || count(*) || ' visible' END FROM live_sessions;
SELECT CASE WHEN count(*) = 0 THEN 'PASS: zero options visible' ELSE 'FAIL' END FROM live_session_options;

\echo '=== T6: code lookup via RPC works for non-member (capability semantics) + rate limit trips at >30/min ==='
SELECT CASE WHEN count(*) = 1 THEN 'PASS: lookup by code returns preview' ELSE 'FAIL' END
FROM get_live_session_by_code('ABCDEF');
DO $$
DECLARE i int; hit boolean := false;
BEGIN
  FOR i IN 1..35 LOOP
    BEGIN
      PERFORM * FROM get_live_session_by_code('WRONGX');
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'rate_limited' THEN hit := true; EXIT; END IF;
      RAISE;
    END;
  END LOOP;
  IF hit THEN RAISE NOTICE 'PASS: rate limit tripped'; ELSE RAISE NOTICE 'FAIL: no rate limit after 35 misses'; END IF;
END $$;

\echo '=== T7: Alice joins via RPC (display_name snapshotted server-side) ==='
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
SELECT join_live_session('00000000-0000-0000-0000-000000000201');
SELECT CASE WHEN display_name = 'Alice' THEN 'PASS: server-side snapshot' ELSE 'FAIL: ' || display_name END
FROM live_participants WHERE user_id = '00000000-0000-0000-0000-00000000000b';

\echo '=== T7b: member lookup not rate-charged (31 calls as Alice must all succeed) ==='
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..31 LOOP
    PERFORM * FROM get_live_session_by_code('ABCDEF');
  END LOOP;
  RAISE NOTICE 'PASS: member exempt from rate limit';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'FAIL: member charged (%)', SQLERRM;
END $$;

\echo '=== T8: Alice cannot vote in lobby; can vote once voting opens ==='
DO $$ BEGIN
  INSERT INTO live_responses (session_id, user_id, option_id)
  VALUES ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-00000000000b',
          '00000000-0000-0000-0000-000000000301');
  RAISE NOTICE 'FAIL: vote accepted in lobby';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: lobby vote rejected';
END $$;

-- Host opens voting
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
UPDATE live_sessions SET status = 'voting', updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000201';

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
INSERT INTO live_responses (session_id, user_id, option_id, note)
VALUES ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-00000000000b',
        '00000000-0000-0000-0000-000000000301', 'Five lives > one')
RETURNING 'PASS: vote accepted while voting' AS t8;

\echo '=== T9: tautology regression — Mallory (participant of ANOTHER session) cannot vote in S1 ==='
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
-- Mallory creates and joins her own session S2 first
INSERT INTO live_sessions (id, code, topic_id, host_id)
VALUES ('00000000-0000-0000-0000-000000000202', 'MN2345',
        '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-00000000000c');
SELECT join_live_session('00000000-0000-0000-0000-000000000202');
DO $$ BEGIN
  INSERT INTO live_responses (session_id, user_id, option_id)
  VALUES ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-00000000000c',
          '00000000-0000-0000-0000-000000000301');
  RAISE NOTICE 'FAIL: cross-session vote accepted (TAUTOLOGY BUG)';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: non-participant vote rejected';
END $$;

\echo '=== T10: round-stuffing regression — round_number 2 rejected ==='
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
DO $$ BEGIN
  INSERT INTO live_responses (session_id, user_id, option_id, round_number)
  VALUES ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-00000000000b',
          '00000000-0000-0000-0000-000000000302', 2);
  RAISE NOTICE 'FAIL: round-2 vote accepted (STUFFING BUG)';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: round-2 vote rejected';
END $$;

\echo '=== T11: cross-session option rejected by RLS (Alice votes in S1 with an S2 option) ==='
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
INSERT INTO live_session_options (id, session_id, label)
VALUES ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000202', 'Foreign option');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
DO $$ BEGIN
  UPDATE live_responses SET option_id = '00000000-0000-0000-0000-000000000303'
  WHERE session_id = '00000000-0000-0000-0000-000000000201'
    AND user_id = '00000000-0000-0000-0000-00000000000b';
  IF FOUND THEN RAISE NOTICE 'FAIL: foreign option accepted'; END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: foreign option rejected';
END $$;

\echo '=== T12: Alice cannot read host rows / other responses; host reads all ==='
SELECT CASE WHEN count(*) = 1 THEN 'PASS: Alice sees only own response' ELSE 'FAIL: ' || count(*) END
FROM live_responses WHERE session_id = '00000000-0000-0000-0000-000000000201';
SELECT CASE WHEN count(*) = 1 THEN 'PASS: Alice sees only own participant row' ELSE 'FAIL: ' || count(*) END
FROM live_participants WHERE session_id = '00000000-0000-0000-0000-000000000201';

\echo '=== T13: tally guarded pre-reveal for participant; host OK; reveals to room after ==='
DO $$ BEGIN
  PERFORM * FROM get_live_tally('00000000-0000-0000-0000-000000000201');
  RAISE NOTICE 'FAIL: participant read tally pre-reveal';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'forbidden' THEN RAISE NOTICE 'PASS: tally forbidden pre-reveal';
  ELSE RAISE NOTICE 'FAIL: unexpected %', SQLERRM; END IF;
END $$;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
SELECT CASE WHEN count(*) = 2 THEN 'PASS: host tally has both options (zero-vote row present)' ELSE 'FAIL: ' || count(*) END
FROM get_live_tally('00000000-0000-0000-0000-000000000201');

\echo '=== T14: non-host cannot setStatus; host cannot do illegal transition; column grants pin question/code/topic ==='
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
UPDATE live_sessions SET status = 'revealed' WHERE id = '00000000-0000-0000-0000-000000000201';
SELECT CASE WHEN status = 'voting' THEN 'PASS: non-host status change ignored by RLS' ELSE 'FAIL: ' || status END
FROM live_sessions WHERE id = '00000000-0000-0000-0000-000000000201';

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
DO $$ BEGIN
  UPDATE live_sessions SET status = 'lobby' WHERE id = '00000000-0000-0000-0000-000000000201';
  RAISE NOTICE 'FAIL: voting->lobby accepted';
EXCEPTION WHEN raise_exception THEN
  RAISE NOTICE 'PASS: illegal transition raises (%)', SQLERRM;
END $$;
DO $$ BEGIN
  UPDATE live_sessions SET question = 'REWRITTEN' WHERE id = '00000000-0000-0000-0000-000000000201';
  RAISE NOTICE 'FAIL: host rewrote question';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: question column pinned by grants';
END $$;
DO $$ BEGIN
  UPDATE live_sessions SET code = 'ZZZZZZ' WHERE id = '00000000-0000-0000-0000-000000000201';
  RAISE NOTICE 'FAIL: host rewrote code';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: code column pinned by grants';
END $$;

\echo '=== T15: options immutable once voting open ==='
DO $$ BEGIN
  UPDATE live_session_options SET label = 'Tampered'
  WHERE id = '00000000-0000-0000-0000-000000000301';
  IF FOUND THEN RAISE NOTICE 'FAIL: option edited mid-vote'; ELSE RAISE NOTICE 'PASS: option edit ignored (0 rows)'; END IF;
END $$;
DO $$ BEGIN
  DELETE FROM live_session_options WHERE id = '00000000-0000-0000-0000-000000000301';
  IF FOUND THEN RAISE NOTICE 'FAIL: option deleted mid-vote'; ELSE RAISE NOTICE 'PASS: option delete ignored (0 rows)'; END IF;
END $$;

\echo '=== T16: reveal closes voting (RLS), reopen reopens it, tally visible to room post-reveal ==='
UPDATE live_sessions SET status = 'revealed', updated_at = now() WHERE id = '00000000-0000-0000-0000-000000000201';
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
DO $$ BEGIN
  UPDATE live_responses SET option_id = '00000000-0000-0000-0000-000000000302'
  WHERE session_id = '00000000-0000-0000-0000-000000000201'
    AND user_id = '00000000-0000-0000-0000-00000000000b';
  IF FOUND THEN RAISE NOTICE 'FAIL: vote changed after reveal'; END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: vote change rejected after reveal';
END $$;
SELECT CASE WHEN count(*) = 2 THEN 'PASS: participant reads tally post-reveal' ELSE 'FAIL' END
FROM get_live_tally('00000000-0000-0000-0000-000000000201');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
UPDATE live_sessions SET status = 'voting', updated_at = now() WHERE id = '00000000-0000-0000-0000-000000000201'
RETURNING 'PASS: reopen voting allowed' AS t16b;

\echo '=== T17: join is no-op for existing participant after end; new joiner rejected; ended is terminal ==='
UPDATE live_sessions SET status = 'ended', ended_at = now(), updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000201';
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
SELECT join_live_session('00000000-0000-0000-0000-000000000201');
SELECT 'PASS: rejoin after end is no-op' AS t17a;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
DO $$ BEGIN
  PERFORM join_live_session('00000000-0000-0000-0000-000000000201');
  RAISE NOTICE 'FAIL: new join accepted after end';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'session_closed' THEN RAISE NOTICE 'PASS: new join rejected after end';
  ELSE RAISE NOTICE 'FAIL: unexpected %', SQLERRM; END IF;
END $$;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
DO $$ BEGIN
  UPDATE live_sessions SET status = 'voting' WHERE id = '00000000-0000-0000-0000-000000000201';
  RAISE NOTICE 'FAIL: ended->voting accepted';
EXCEPTION WHEN raise_exception THEN
  RAISE NOTICE 'PASS: ended is terminal';
END $$;

\echo '=== T18: anon role fully locked out ==='
RESET request.jwt.claims;
SET ROLE anon;
DO $$ BEGIN
  PERFORM * FROM get_live_session_by_code('ABCDEF');
  RAISE NOTICE 'FAIL: anon executed code lookup';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: anon cannot execute RPCs';
END $$;
RESET ROLE;

\echo '=== done ==='
