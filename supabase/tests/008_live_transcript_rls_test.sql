-- Hard Problem: Live Transcript RLS test harness + checklist
-- ⚠ LOCAL TEST ONLY. Stubs Supabase on PG16, runs 005+006+008, then exercises
-- the Sprint 4 transcript privacy + count checklist. Prints PASS/FAIL.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE PUBLICATION supabase_realtime;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
  role TEXT CHECK (role IN ('user','editor','admin')) DEFAULT 'user'
);
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
  status TEXT CHECK (status IN ('draft','published','archived')) DEFAULT 'draft',
  discussion_prompt TEXT NOT NULL DEFAULT ''
);
CREATE TABLE user_progress (
  user_id UUID NOT NULL, topic_id UUID NOT NULL,
  quiz_passed BOOLEAN DEFAULT FALSE, PRIMARY KEY (user_id, topic_id)
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public user profiles" ON users FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON users FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Published topics visible to all" ON topics FOR SELECT USING (
  status = 'published' OR auth.uid() IN (SELECT id FROM users WHERE role IN ('editor','admin')));
GRANT ALL ON users, topics, user_progress TO anon, authenticated, service_role;

INSERT INTO users (id, email, display_name) VALUES
  ('00000000-0000-0000-0000-00000000000a','host@test.dev','Hosty'),
  ('00000000-0000-0000-0000-00000000000b','alice@test.dev','Alice'),
  ('00000000-0000-0000-0000-00000000000c','bob@test.dev','Bob');
INSERT INTO topics (id, title, slug, status) VALUES
  ('00000000-0000-0000-0000-000000000101','Trolley','trolley','published');
INSERT INTO user_progress (user_id, topic_id, quiz_passed) VALUES
  ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000101', true);

\i ../migrations/005_live_sessions.sql
\i ../migrations/006_spotlight_draw.sql
\i ../migrations/008_live_transcript.sql

\set HOST '00000000-0000-0000-0000-00000000000a'
\set ALICE '00000000-0000-0000-0000-00000000000b'
\set BOB '00000000-0000-0000-0000-00000000000c'
\set S1 '00000000-0000-0000-0000-000000000201'

-- Setup as superuser (bypasses RLS + column pins) to plant controlled participation
\echo '=== Setup: Alice attends S1, votes, and has controlled spotlight draws ==='
INSERT INTO live_sessions (id, code, topic_id, host_id, question, status)
VALUES (:'S1','ABCDEF','00000000-0000-0000-0000-000000000101',:'HOST','Q?','voting');
INSERT INTO live_session_options (id, session_id, label) VALUES
  ('00000000-0000-0000-0000-000000000301', :'S1', 'A');
INSERT INTO live_participants (session_id, user_id, display_name) VALUES (:'S1', :'ALICE', 'Alice');
INSERT INTO live_responses (session_id, user_id, option_id) VALUES (:'S1', :'ALICE', '00000000-0000-0000-0000-000000000301');
-- Draws: shared, cleared (excluded), minority_steelman+shared, passed,
-- and a passed-but-note_shared draw (exercises the `OR note_shared` disjunct).
INSERT INTO live_spotlight_draws (session_id, cycle, sequence, mode, drawn_user_id, display_name, pool_size, outcome, note_shared) VALUES
  (:'S1', 0, 1, 'uniform',           :'ALICE', 'Alice', 3, 'shared',  false),
  (:'S1', 0, 2, 'uniform',           :'ALICE', 'Alice', 3, 'cleared', false),
  (:'S1', 0, 3, 'minority_steelman', :'ALICE', 'Alice', 2, 'shared',  false),
  (:'S1', 0, 4, 'no_repeat',         :'ALICE', 'Alice', 3, 'passed',  false),
  (:'S1', 0, 5, 'no_repeat',         :'ALICE', 'Alice', 3, 'passed',  true);

SET ROLE authenticated;

\echo '=== T1: anon cannot execute get_live_transcript ==='
SET ROLE anon;
DO $$ BEGIN
  PERFORM * FROM get_live_transcript('00000000-0000-0000-0000-00000000000b');
  RAISE NOTICE 'FAIL: anon read transcript';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon cannot read transcript'; END $$;
RESET ROLE; SET ROLE authenticated;

\echo '=== T2: self sees own counts (private by default, is_public=false) ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
SELECT CASE WHEN sessions_attended=1 AND votes_cast=1 AND times_spotlighted=4 AND times_shared=3
                 AND steelman_count=1 AND quiz_passed_topics=1 AND is_public=false
            THEN 'PASS: self counts correct (spotlit=4 excl cleared, shared=3 incl note_shared, steelman=1), private'
            ELSE 'FAIL: att='||sessions_attended||' votes='||votes_cast||' spot='||times_spotlighted
                 ||' shared='||times_shared||' steel='||steelman_count||' quiz='||quiz_passed_topics||' pub='||is_public END
FROM get_live_transcript(:'ALICE');

\echo '=== T3: other viewer of an opted-OUT target → all-zero, is_public=false (not error) ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000c"}',false);
SELECT CASE WHEN sessions_attended=0 AND votes_cast=0 AND times_spotlighted=0 AND is_public=false
            THEN 'PASS: opted-out target hidden (zeros, is_public=false)'
            ELSE 'FAIL: leaked att='||sessions_attended||' pub='||is_public END
FROM get_live_transcript(:'ALICE');

\echo '=== T4: Alice opts in → other viewer now sees real counts ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
UPDATE users SET live_transcript_public=true WHERE id=:'ALICE';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000c"}',false);
SELECT CASE WHEN sessions_attended=1 AND times_spotlighted=4 AND is_public=true
            THEN 'PASS: opted-in target visible to others'
            ELSE 'FAIL: att='||sessions_attended||' pub='||is_public END
FROM get_live_transcript(:'ALICE');

\echo '=== T5: a non-owner cannot flip another user''s publish flag (RLS) ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000c"}',false);
UPDATE users SET live_transcript_public=false WHERE id=:'ALICE';
SELECT CASE WHEN live_transcript_public=true THEN 'PASS: Bob cannot change Alice''s setting (0 rows)'
            ELSE 'FAIL: flag changed' END
FROM users WHERE id=:'ALICE';

\echo '=== T6: not_found for a missing user ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
DO $$ BEGIN
  PERFORM * FROM get_live_transcript('00000000-0000-0000-0000-0000000000ff');
  RAISE NOTICE 'FAIL: missing user returned a transcript';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='not_found' THEN RAISE NOTICE 'PASS: missing user → not_found'; ELSE RAISE NOTICE 'FAIL: %',SQLERRM; END IF;
END $$;

RESET ROLE;
\echo '=== done ==='
