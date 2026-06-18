-- Hard Problem: Live Quiz RLS test harness + security checklist
-- ⚠ LOCAL TEST ONLY. Stubs Supabase on stock Postgres 16, runs 005+006+007,
-- then exercises the Sprint 3 checklist. All assertions print PASS/FAIL.
-- Usage: createdb, then psql -f this_file (it \i's the migrations).

-- ===== Stub Supabase on stock Postgres 16 =====
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
-- 001's quiz_questions (only what 007 references), with its real public-read RLS
CREATE TABLE quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT CHECK (question_type IN ('mcq','true_false')) NOT NULL,
  options JSONB, correct_answer TEXT NOT NULL, explanation TEXT, display_order INTEGER DEFAULT 0
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public user profiles" ON users FOR SELECT USING (true);
CREATE POLICY "Published topics visible to all" ON topics FOR SELECT USING (
  status = 'published' OR auth.uid() IN (SELECT id FROM users WHERE role IN ('editor','admin')));
CREATE POLICY "Quiz questions public read" ON quiz_questions FOR SELECT USING (true);
GRANT ALL ON users, topics, quiz_questions TO anon, authenticated, service_role;

INSERT INTO users (id, email, display_name) VALUES
  ('00000000-0000-0000-0000-00000000000a','host@test.dev','Hosty'),
  ('00000000-0000-0000-0000-00000000000b','alice@test.dev','Alice'),
  ('00000000-0000-0000-0000-00000000000c','bob@test.dev','Bob'),
  ('00000000-0000-0000-0000-00000000000e','mallory@test.dev','Mallory');
INSERT INTO topics (id, title, slug, status) VALUES
  ('00000000-0000-0000-0000-000000000101','Trolley','trolley','published'),
  ('00000000-0000-0000-0000-000000000102','Other','other','published');
INSERT INTO quiz_questions (id, topic_id, question_text, question_type, options, correct_answer, explanation) VALUES
  ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000101','Pick A?','mcq',
   '[{"label":"A","text":"yes"},{"label":"B","text":"no"}]','A','Because A.'),
  ('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000101','True?','true_false',
   NULL,'true','It is true.'),
  ('00000000-0000-0000-0000-000000000403','00000000-0000-0000-0000-000000000102','Foreign?','mcq',
   '[{"label":"A","text":"x"}]','A',NULL);

\i ../migrations/005_live_sessions.sql
\i ../migrations/006_spotlight_draw.sql
\i ../migrations/007_live_quiz.sql

\set HOST '00000000-0000-0000-0000-00000000000a'
\set ALICE '00000000-0000-0000-0000-00000000000b'
\set BOB '00000000-0000-0000-0000-00000000000c'
\set MALLORY '00000000-0000-0000-0000-00000000000e'
\set S1 '00000000-0000-0000-0000-000000000201'
\set QM '00000000-0000-0000-0000-000000000401'
\set QX '00000000-0000-0000-0000-000000000403'

\echo '=== Setup: host creates S1 (topic Trolley), opens voting; Alice + Bob join ==='
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
INSERT INTO live_sessions (id, code, topic_id, host_id, question)
VALUES (:'S1','ABCDEF','00000000-0000-0000-0000-000000000101',:'HOST','Q?');
UPDATE live_sessions SET status='voting', updated_at=now() WHERE id=:'S1';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
SELECT join_live_session(:'S1');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000c"}',false);
SELECT join_live_session(:'S1');

\echo '=== Q1: non-host cannot push a quiz question ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
DO $$ BEGIN
  PERFORM * FROM push_live_quiz_round('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000401');
  RAISE NOTICE 'FAIL: non-host pushed';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='forbidden' THEN RAISE NOTICE 'PASS: non-host push forbidden'; ELSE RAISE NOTICE 'FAIL: %',SQLERRM; END IF;
END $$;

\echo '=== Q2: topic mismatch rejected ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
DO $$ BEGIN
  PERFORM * FROM push_live_quiz_round('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000403');
  RAISE NOTICE 'FAIL: foreign-topic question pushed';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='question_topic_mismatch' THEN RAISE NOTICE 'PASS: topic mismatch rejected'; ELSE RAISE NOTICE 'FAIL: %',SQLERRM; END IF;
END $$;

\echo '=== Q3: host pushes QM → round asking, pointer set ==='
SELECT CASE WHEN sequence=1 THEN 'PASS: round 1 pushed' ELSE 'FAIL' END
FROM push_live_quiz_round(:'S1',:'QM');
SELECT CASE WHEN current_quiz_round_id IS NOT NULL THEN 'PASS: quiz pointer set' ELSE 'FAIL' END
FROM live_sessions WHERE id=:'S1';

\echo '=== Q3b: idempotent re-push returns same round ==='
DO $$
DECLARE r1 uuid; r2 uuid;
BEGIN
  SELECT current_quiz_round_id INTO r1 FROM live_sessions WHERE id='00000000-0000-0000-0000-000000000201';
  SELECT round_id INTO r2 FROM push_live_quiz_round('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000401');
  IF r1=r2 THEN RAISE NOTICE 'PASS: re-push idempotent'; ELSE RAISE NOTICE 'FAIL: new round on re-push'; END IF;
END $$;

\echo '=== Q4: correct_answer withheld from member pre-reveal, visible to host ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
SELECT CASE WHEN correct_answer IS NULL THEN 'PASS: member sees no correct_answer pre-reveal' ELSE 'FAIL: leaked '||correct_answer END
FROM get_current_quiz_round(:'S1');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
SELECT CASE WHEN correct_answer='A' THEN 'PASS: host sees correct_answer' ELSE 'FAIL' END
FROM get_current_quiz_round(:'S1');

\echo '=== Q5: Alice answers A (correct), lock-in ignores second answer, count bumps ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
DO $$
DECLARE rid uuid;
BEGIN
  SELECT current_quiz_round_id INTO rid FROM live_sessions WHERE id='00000000-0000-0000-0000-000000000201';
  PERFORM submit_live_quiz_answer('00000000-0000-0000-0000-000000000201', rid, 'A');
  PERFORM submit_live_quiz_answer('00000000-0000-0000-0000-000000000201', rid, 'B'); -- lock-in: ignored
END $$;
SELECT CASE WHEN answer='A' THEN 'PASS: first answer locked in' ELSE 'FAIL: '||answer END
FROM live_quiz_answers WHERE user_id=:'ALICE';
-- Bob answers B (incorrect)
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000c"}',false);
DO $$
DECLARE rid uuid; BEGIN
  SELECT current_quiz_round_id INTO rid FROM live_sessions WHERE id='00000000-0000-0000-0000-000000000201';
  PERFORM submit_live_quiz_answer('00000000-0000-0000-0000-000000000201', rid, 'B');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
SELECT CASE WHEN answer_count=2 THEN 'PASS: answer_count=2 (lock-in not double-counted)' ELSE 'FAIL: '||answer_count END
FROM live_quiz_rounds WHERE session_id=:'S1' AND sequence=1;

\echo '=== Q5b: a member sees ONLY their own answer row (the fan-out RLS rule) ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
SELECT CASE WHEN count(*)=1 THEN 'PASS: member Alice sees only her own answer (Bob''s hidden)'
            ELSE 'FAIL: member saw '||count(*)||' rows' END
FROM live_quiz_answers WHERE session_id=:'S1';

\echo '=== Q6: Mallory (non-member) cannot submit or read another answer ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000e"}',false);
DO $$
DECLARE rid uuid; BEGIN
  SELECT current_quiz_round_id INTO rid FROM live_sessions WHERE id='00000000-0000-0000-0000-000000000201';
  BEGIN
    PERFORM submit_live_quiz_answer('00000000-0000-0000-0000-000000000201', rid, 'A');
    RAISE NOTICE 'FAIL: non-member submitted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='forbidden' THEN RAISE NOTICE 'PASS: non-member submit forbidden'; ELSE RAISE NOTICE 'FAIL: %',SQLERRM; END IF;
  END;
END $$;
SELECT CASE WHEN count(*)=0 THEN 'PASS: non-member sees zero answers' ELSE 'FAIL: '||count(*) END
FROM live_quiz_answers WHERE session_id=:'S1';

\echo '=== Q7: non-host cannot read aggregate pre-reveal ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
DO $$
DECLARE rid uuid; BEGIN
  SELECT current_quiz_round_id INTO rid FROM live_sessions WHERE id='00000000-0000-0000-0000-000000000201';
  BEGIN
    PERFORM * FROM get_live_quiz_aggregate(rid);
    RAISE NOTICE 'FAIL: member read aggregate pre-reveal';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='forbidden' THEN RAISE NOTICE 'PASS: aggregate forbidden pre-reveal'; ELSE RAISE NOTICE 'FAIL: %',SQLERRM; END IF;
  END;
END $$;

\echo '=== Q8: host reveals → grading + speed score (correct in [500,1000], wrong=0) ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
DO $$
DECLARE rid uuid; BEGIN
  SELECT current_quiz_round_id INTO rid FROM live_sessions WHERE id='00000000-0000-0000-0000-000000000201';
  PERFORM reveal_live_quiz_round('00000000-0000-0000-0000-000000000201', rid);
END $$;
SELECT CASE WHEN is_correct AND score BETWEEN 500 AND 1000 THEN 'PASS: Alice correct, score '||score
            ELSE 'FAIL: correct='||is_correct||' score='||score END
FROM live_quiz_answers WHERE user_id=:'ALICE';
SELECT CASE WHEN is_correct=false AND score=0 THEN 'PASS: Bob wrong, score 0' ELSE 'FAIL' END
FROM live_quiz_answers WHERE user_id=:'BOB';

\echo '=== Q9: post-reveal member reads aggregate (all choices incl 0-count) + correct_answer ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
DO $$
DECLARE rid uuid; n int; BEGIN
  SELECT current_quiz_round_id INTO rid FROM live_sessions WHERE id='00000000-0000-0000-0000-000000000201';
  SELECT count(*) INTO n FROM get_live_quiz_aggregate(rid);
  IF n=2 THEN RAISE NOTICE 'PASS: aggregate has both choices A,B'; ELSE RAISE NOTICE 'FAIL: % rows',n; END IF;
END $$;
SELECT CASE WHEN correct_answer='A' AND my_answer='A' AND my_is_correct THEN 'PASS: member sees answer post-reveal'
            ELSE 'FAIL' END FROM get_current_quiz_round(:'S1');

\echo '=== Q10: leaderboard — host always; member when public+revealed; blocked when hidden ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
SELECT CASE WHEN count(*)=2 THEN 'PASS: host leaderboard lists both' ELSE 'FAIL: '||count(*) END
FROM get_live_quiz_leaderboard(:'S1');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
SELECT CASE WHEN count(*)=2 THEN 'PASS: member reads leaderboard (public+revealed)' ELSE 'FAIL' END
FROM get_live_quiz_leaderboard(:'S1');
-- host hides it
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
UPDATE live_sessions SET quiz_leaderboard_public=false WHERE id=:'S1';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
DO $$ BEGIN
  PERFORM * FROM get_live_quiz_leaderboard('00000000-0000-0000-0000-000000000201');
  RAISE NOTICE 'FAIL: member read hidden leaderboard';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='forbidden' THEN RAISE NOTICE 'PASS: hidden leaderboard forbidden to member'; ELSE RAISE NOTICE 'FAIL: %',SQLERRM; END IF;
END $$;

\echo '=== Q11: column pins — host cannot raw-write quiz pointer or answer score ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
DO $$ BEGIN
  UPDATE live_sessions SET current_quiz_round_id=NULL WHERE id='00000000-0000-0000-0000-000000000201';
  RAISE NOTICE 'FAIL: host raw-wrote quiz pointer';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: quiz pointer column-pinned'; END $$;
DO $$ BEGIN
  UPDATE live_quiz_answers SET score=9999 WHERE session_id='00000000-0000-0000-0000-000000000201';
  RAISE NOTICE 'FAIL: host raw-wrote answer score';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: answer columns pinned'; END $$;

\echo '=== Q12: trigger — revealed round cannot return to asking ==='
DO $$
DECLARE rid uuid; BEGIN
  SELECT current_quiz_round_id INTO rid FROM live_sessions WHERE id='00000000-0000-0000-0000-000000000201';
  BEGIN
    UPDATE live_quiz_rounds SET status='asking' WHERE id=rid;
    RAISE NOTICE 'FAIL: revealed->asking accepted';
  EXCEPTION
    WHEN raise_exception THEN RAISE NOTICE 'PASS: revealed is terminal';
    WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: rounds UPDATE pinned (also terminal in RPC)';
  END;
END $$;

\echo '=== Q13: results persist after the session ends (host reads leaderboard) ==='
UPDATE live_sessions SET status='revealed', updated_at=now() WHERE id=:'S1';
UPDATE live_sessions SET status='ended', ended_at=now(), updated_at=now() WHERE id=:'S1';
SELECT CASE WHEN count(*)=2 THEN 'PASS: leaderboard survives session end' ELSE 'FAIL' END
FROM get_live_quiz_leaderboard(:'S1');

\echo '=== Q14: anon locked out of every quiz RPC ==='
RESET request.jwt.claims;
SET ROLE anon;
DO $$ BEGIN PERFORM * FROM get_current_quiz_round('00000000-0000-0000-0000-000000000201');
  RAISE NOTICE 'FAIL: anon read round';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon cannot get_current_quiz_round'; END $$;
DO $$ BEGIN PERFORM push_live_quiz_round('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000401');
  RAISE NOTICE 'FAIL: anon pushed';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon cannot push'; END $$;
RESET ROLE;

\echo '=== done ==='
