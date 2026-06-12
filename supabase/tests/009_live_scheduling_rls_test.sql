-- Hard Problem: Live Scheduling RLS test harness + checklist
-- ⚠ LOCAL TEST ONLY. Stubs Supabase on PG16, runs 005..009, then exercises the
-- Sprint 5 scheduling/rsvp/recap checklist. Prints PASS/FAIL.

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
CREATE TABLE quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT CHECK (question_type IN ('mcq','true_false')) NOT NULL,
  options JSONB, correct_answer TEXT NOT NULL, explanation TEXT, display_order INTEGER DEFAULT 0
);
CREATE TABLE user_progress (
  user_id UUID NOT NULL, topic_id UUID NOT NULL,
  quiz_passed BOOLEAN DEFAULT FALSE, PRIMARY KEY (user_id, topic_id)
);
-- 001's notifications with the inline (auto-named) type CHECK — 009 must drop it
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('build_on','reply','moderation')) NOT NULL,
  actor_id UUID, contribution_id UUID, topic_id UUID,
  is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public user profiles" ON users FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON users FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Published topics visible to all" ON topics FOR SELECT USING (
  status = 'published' OR auth.uid() IN (SELECT id FROM users WHERE role IN ('editor','admin')));
CREATE POLICY "Quiz questions public read" ON quiz_questions FOR SELECT USING (true);
GRANT ALL ON users, topics, quiz_questions, user_progress, notifications TO anon, authenticated, service_role;

INSERT INTO users (id, email, display_name) VALUES
  ('00000000-0000-0000-0000-00000000000a','host@test.dev','Hosty'),
  ('00000000-0000-0000-0000-00000000000b','alice@test.dev','Alice'),
  ('00000000-0000-0000-0000-00000000000e','mallory@test.dev','Mallory');
INSERT INTO topics (id, title, slug, status) VALUES
  ('00000000-0000-0000-0000-000000000101','Trolley','trolley','published');

\i ../migrations/005_live_sessions.sql
\i ../migrations/006_spotlight_draw.sql
\i ../migrations/007_live_quiz.sql
\i ../migrations/008_live_transcript.sql
\i ../migrations/009_live_scheduling.sql

\set HOST '00000000-0000-0000-0000-00000000000a'
\set ALICE '00000000-0000-0000-0000-00000000000b'
\set MALLORY '00000000-0000-0000-0000-00000000000e'
\set S1 '00000000-0000-0000-0000-000000000201'
\set OPT '00000000-0000-0000-0000-000000000301'

\echo '=== sanity: session_reminder is now an accepted notification type ==='
INSERT INTO notifications (user_id, type) VALUES (:'ALICE', 'session_reminder');
SELECT CASE WHEN count(*)=1 THEN 'PASS: session_reminder type accepted' ELSE 'FAIL' END
FROM notifications WHERE type='session_reminder';

\echo '=== Setup: host creates S1 (lobby) ==='
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
INSERT INTO live_sessions (id, code, topic_id, host_id, question)
VALUES (:'S1','ABCDEF','00000000-0000-0000-0000-000000000101',:'HOST','Q?');

\echo '=== S1: non-host cannot schedule ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
DO $$ BEGIN
  PERFORM schedule_live_session('00000000-0000-0000-0000-000000000201', now()+interval '1 day', true);
  RAISE NOTICE 'FAIL: non-host scheduled';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='forbidden' THEN RAISE NOTICE 'PASS: non-host schedule forbidden'; ELSE RAISE NOTICE 'FAIL: %',SQLERRM; END IF;
END $$;

\echo '=== S2: host schedules → published + starts_at set; pinned columns reject direct write ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
SELECT schedule_live_session(:'S1', now()+interval '1 day', true);
SELECT CASE WHEN published AND starts_at IS NOT NULL AND status='lobby' THEN 'PASS: scheduled (lobby + published + starts_at)' ELSE 'FAIL' END
FROM live_sessions WHERE id=:'S1';
DO $$ BEGIN
  UPDATE live_sessions SET starts_at = now() WHERE id='00000000-0000-0000-0000-000000000201';
  RAISE NOTICE 'FAIL: host raw-wrote starts_at';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: starts_at column-pinned'; END $$;
DO $$ BEGIN
  UPDATE live_sessions SET published = false WHERE id='00000000-0000-0000-0000-000000000201';
  RAISE NOTICE 'FAIL: host raw-wrote published';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: published column-pinned'; END $$;

\echo '=== S3: RSVP requires published; Alice RSVPs; idempotent; no participant row created ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
SELECT rsvp_live_session(:'S1');
SELECT rsvp_live_session(:'S1'); -- idempotent
SELECT CASE WHEN count(*)=1 THEN 'PASS: RSVP recorded once (idempotent)' ELSE 'FAIL: '||count(*) END
FROM live_rsvps WHERE session_id=:'S1' AND user_id=:'ALICE';
SELECT CASE WHEN count(*)=0 THEN 'PASS: RSVP did not create a participant row' ELSE 'FAIL' END
FROM live_participants WHERE session_id=:'S1' AND user_id=:'ALICE';

\echo '=== S3b: RSVP on an unpublished session is rejected ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
INSERT INTO live_sessions (id, code, topic_id, host_id) VALUES
  ('00000000-0000-0000-0000-000000000202','UNPUB2','00000000-0000-0000-0000-000000000101',:'HOST');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
DO $$ BEGIN
  PERFORM rsvp_live_session('00000000-0000-0000-0000-000000000202');
  RAISE NOTICE 'FAIL: rsvp on unpublished accepted';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='not_published' THEN RAISE NOTICE 'PASS: unpublished RSVP rejected'; ELSE RAISE NOTICE 'FAIL: %',SQLERRM; END IF;
END $$;

\echo '=== S4: RSVP visibility — Mallory cannot see Alice''s RSVP; host can; withdraw own only ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000e"}',false);
SELECT CASE WHEN count(*)=0 THEN 'PASS: non-host non-owner sees zero RSVPs' ELSE 'FAIL: '||count(*) END
FROM live_rsvps WHERE session_id=:'S1';
DO $$ BEGIN
  DELETE FROM live_rsvps WHERE session_id='00000000-0000-0000-0000-000000000201' AND user_id='00000000-0000-0000-0000-00000000000b';
  IF FOUND THEN RAISE NOTICE 'FAIL: Mallory deleted Alice RSVP'; ELSE RAISE NOTICE 'PASS: cannot withdraw another''s RSVP (0 rows)'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
SELECT CASE WHEN count(*)=1 THEN 'PASS: host sees the RSVP' ELSE 'FAIL: '||count(*) END
FROM live_rsvps WHERE session_id=:'S1';

\echo '=== S4b: Alice''s upcoming-RSVPs list returns S1 with its code ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
SELECT CASE WHEN count(*)=1 AND bool_and(code='ABCDEF') THEN 'PASS: get_my_upcoming_rsvps returns S1'
            ELSE 'FAIL: '||count(*) END
FROM get_my_upcoming_rsvps();

\echo '=== Setup recap: open voting, Alice joins+votes; plant a spotlight + quiz answer; end ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
-- insert the option as host while still in lobby, then open voting
INSERT INTO live_session_options (id, session_id, label) VALUES (:'OPT', :'S1', 'A');
UPDATE live_sessions SET status='voting', updated_at=now() WHERE id=:'S1';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
SELECT join_live_session(:'S1');
INSERT INTO live_responses (session_id, user_id, option_id) VALUES (:'S1', :'ALICE', :'OPT');
RESET ROLE;  -- superuser: plant controlled spotlight + quiz rows
INSERT INTO live_spotlight_draws (session_id, cycle, sequence, mode, drawn_user_id, display_name, pool_size, outcome, note_shared) VALUES
  (:'S1', 0, 1, 'uniform',   :'ALICE', 'Alice', 1, 'shared', false),
  (:'S1', 0, 2, 'no_repeat', :'ALICE', 'Alice', 1, 'passed', true);  -- passed but note projected → counts as shared
INSERT INTO live_quiz_rounds (id, session_id, sequence, question_text, question_type, correct_answer, status)
VALUES ('00000000-0000-0000-0000-000000000701', :'S1', 1, 'Q?', 'true_false', 'true', 'revealed');
INSERT INTO live_quiz_answers (session_id, round_id, user_id, answer, is_correct, score)
VALUES (:'S1', '00000000-0000-0000-0000-000000000701', :'ALICE', 'true', true, 1000);
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
UPDATE live_sessions SET status='revealed', updated_at=now() WHERE id=:'S1';
UPDATE live_sessions SET status='ended', ended_at=now(), updated_at=now() WHERE id=:'S1';

\echo '=== S5: recap — host reads aggregates; counts correct ==='
SELECT CASE WHEN participant_count=1 AND rsvp_count=1 AND vote_count=1 AND spotlight_count=2
                 AND spotlight_shared=2 AND quiz_rounds=1 AND quiz_answers=1
            THEN 'PASS: recap counts correct'
            ELSE 'FAIL: part='||participant_count||' rsvp='||rsvp_count||' vote='||vote_count
                 ||' spot='||spotlight_count||' shared='||spotlight_shared||' qr='||quiz_rounds||' qa='||quiz_answers END
FROM get_session_recap(:'S1');

\echo '=== S6: recap — non-member forbidden ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000e"}',false);
DO $$ BEGIN
  PERFORM * FROM get_session_recap('00000000-0000-0000-0000-000000000201');
  RAISE NOTICE 'FAIL: non-member read recap';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='forbidden' THEN RAISE NOTICE 'PASS: non-member recap forbidden'; ELSE RAISE NOTICE 'FAIL: %',SQLERRM; END IF;
END $$;

\echo '=== S7: anon locked out of schedule / rsvp / recap ==='
RESET request.jwt.claims; SET ROLE anon;
DO $$ BEGIN PERFORM schedule_live_session('00000000-0000-0000-0000-000000000201', now(), true);
  RAISE NOTICE 'FAIL: anon scheduled';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon cannot schedule'; END $$;
DO $$ BEGIN PERFORM rsvp_live_session('00000000-0000-0000-0000-000000000201');
  RAISE NOTICE 'FAIL: anon rsvp';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon cannot rsvp'; END $$;
DO $$ BEGIN PERFORM * FROM get_session_recap('00000000-0000-0000-0000-000000000201');
  RAISE NOTICE 'FAIL: anon recap';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon cannot recap'; END $$;
RESET ROLE;

\echo '=== done ==='
