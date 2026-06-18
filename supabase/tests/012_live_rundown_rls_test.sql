-- Hard Problem: version-2 rundown adversarial test harness.
-- Run from supabase/tests against a clean local Postgres database.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
CREATE PUBLICATION supabase_realtime;
CREATE EXTENSION dblink;

CREATE TABLE users(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),email TEXT UNIQUE NOT NULL,display_name TEXT NOT NULL,role TEXT DEFAULT 'user');
CREATE TABLE topics(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),title TEXT NOT NULL,slug TEXT UNIQUE NOT NULL,status TEXT DEFAULT 'published',discussion_prompt TEXT NOT NULL DEFAULT '');
CREATE TABLE quiz_questions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),topic_id UUID REFERENCES topics(id),question_text TEXT NOT NULL,question_type TEXT NOT NULL,options JSONB,correct_answer TEXT NOT NULL,explanation TEXT,display_order INTEGER DEFAULT 0);
CREATE TABLE user_progress(user_id UUID,topic_id UUID,quiz_passed BOOLEAN DEFAULT false,PRIMARY KEY(user_id,topic_id));
CREATE TABLE notifications(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID REFERENCES users(id),type TEXT CHECK(type IN('build_on','reply','moderation')) NOT NULL,actor_id UUID,contribution_id UUID,topic_id UUID,is_read BOOLEAN DEFAULT false,created_at TIMESTAMPTZ DEFAULT now());
ALTER TABLE users ENABLE ROW LEVEL SECURITY; ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_read ON users FOR SELECT USING(true); CREATE POLICY users_update ON users FOR UPDATE USING(id=auth.uid());
CREATE POLICY topics_read ON topics FOR SELECT USING(status='published'); CREATE POLICY quiz_read ON quiz_questions FOR SELECT USING(true);
GRANT ALL ON users,topics,quiz_questions,user_progress,notifications TO anon,authenticated,service_role;

INSERT INTO users(id,email,display_name) VALUES
 ('00000000-0000-0000-0000-00000000000a','host@test','Host'),
 ('00000000-0000-0000-0000-00000000000b','alice@test','Alice'),
 ('00000000-0000-0000-0000-00000000000c','bob@test','Bob');
INSERT INTO topics(id,title,slug,status) VALUES('00000000-0000-0000-0000-000000000101','Ethics','ethics','published');

\i ../migrations/005_live_sessions.sql
\i ../migrations/006_spotlight_draw.sql
\i ../migrations/007_live_quiz.sql
\i ../migrations/008_live_transcript.sql
\i ../migrations/009_live_scheduling.sql
\i ../migrations/012_live_rundown.sql

UPDATE live_runtime_config SET value='internal' WHERE key='rundown_v2_creation';

\set HOST '00000000-0000-0000-0000-00000000000a'
\set ALICE '00000000-0000-0000-0000-00000000000b'
\set BOB '00000000-0000-0000-0000-00000000000c'
\set S1 '00000000-0000-0000-0000-000000000201'

INSERT INTO live_sessions(id,code,topic_id,host_id,question,format_version) VALUES(:'S1','ABCDEF','00000000-0000-0000-0000-000000000101',:'HOST','',2);
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
SELECT replace_live_rundown(:'S1','[
 {"kind":"text","title":"Context","content":{"body":"Read this"}},
 {"kind":"choice","prompt":"Choose","config":{"options":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"max_selections":1,"audience_results":"on_reveal"}},
 {"kind":"open_text","prompt":"Why?","config":{"max_length":500,"audience_results":"on_reveal"}}
]'::jsonb);

\echo '=== R1: activate is host-only and activated definition is pinned ==='
SELECT activate_live_block_v2(:'S1',(SELECT id FROM live_session_blocks WHERE session_id=:'S1' AND kind='choice'),false,'00000000-0000-0000-0000-000000000301') AS choice_run \gset
SELECT CASE WHEN activate_live_block_v2(:'S1',(SELECT id FROM live_session_blocks WHERE session_id=:'S1' AND kind='choice'),false,'00000000-0000-0000-0000-000000000301')=:'choice_run'::uuid
  THEN 'PASS: activation request is idempotent' ELSE 'FAIL' END;
DO $$ BEGIN
  UPDATE live_session_blocks SET prompt='tampered'
  WHERE session_id='00000000-0000-0000-0000-000000000201' AND kind='choice';
  IF FOUND THEN RAISE EXCEPTION 'FAIL: activated block changed'; END IF;
  RAISE NOTICE 'PASS: activated block pinned';
END $$;

-- Join both participants through the protected RPC.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
SELECT join_live_session(:'S1',true);
SELECT submit_live_block_response(:'choice_run','{"selections":["a"]}', 'private reason','private') AS alice_response \gset
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000c"}',false);
SELECT join_live_session(:'S1',true);

\echo '=== R2: cross-run/invalid option rejected ==='
DO $$ BEGIN PERFORM submit_live_block_response((SELECT current_block_run_id FROM live_sessions WHERE id='00000000-0000-0000-0000-000000000201'),'{"selections":["not-an-option"]}',NULL,'private'); RAISE NOTICE 'FAIL: invalid option accepted';
EXCEPTION WHEN OTHERS THEN IF SQLERRM='bad_response' THEN RAISE NOTICE 'PASS: invalid option rejected'; ELSE RAISE; END IF; END $$;

\echo '=== R3: participant and host cannot raw-read Alice private text ==='
SELECT CASE WHEN count(*)=0 THEN 'PASS: other participant cannot read private row' ELSE 'FAIL' END FROM live_block_responses WHERE id=:'alice_response';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
SELECT CASE WHEN count(*)=0 THEN 'PASS: host cannot raw-read private row' ELSE 'FAIL' END FROM live_block_responses WHERE id=:'alice_response';
SELECT CASE WHEN count(*)=0 THEN 'PASS: private response absent from candidate RPC' ELSE 'FAIL' END FROM get_live_share_candidates(:'choice_run');

\echo '=== R4: host cannot publish private response; participant can consent then revoke ==='
SELECT set_config('test.response_id', :'alice_response', false);
DO $$ BEGIN PERFORM publish_live_response(current_setting('test.response_id')::uuid,0); RAISE NOTICE 'FAIL: private response published';
EXCEPTION WHEN OTHERS THEN IF SQLERRM='not_consented' THEN RAISE NOTICE 'PASS: publication requires consent'; ELSE RAISE; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
SELECT set_live_response_share_scope(:'alice_response','anonymous');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
SELECT publish_live_response(:'alice_response',0);
DO $$ BEGIN
  IF jsonb_array_length(public.get_current_live_block('00000000-0000-0000-0000-000000000201')->'publications') <> 1
    THEN RAISE EXCEPTION 'FAIL: consented response was not projected';
  END IF;
  RAISE NOTICE 'PASS: consented response published';
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b"}',false);
SELECT set_live_response_share_scope(:'alice_response','private');
SELECT CASE WHEN count(*)=0 THEN 'PASS: consent withdrawal removed publication' ELSE 'FAIL' END FROM live_response_publications WHERE response_id=:'alice_response' AND active;

\echo '=== R5: race-safe close blocks late submission ==='
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
SELECT close_live_block(:'S1',:'choice_run');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000c"}',false);
DO $$ BEGIN PERFORM submit_live_block_response((SELECT current_block_run_id FROM live_sessions WHERE id='00000000-0000-0000-0000-000000000201'),'{"selections":["b"]}',NULL,'private'); RAISE NOTICE 'FAIL: late response accepted';
EXCEPTION WHEN OTHERS THEN IF SQLERRM='block_closed' THEN RAISE NOTICE 'PASS: late response rejected'; ELSE RAISE; END IF; END $$;

\echo '=== R6: anon cannot execute rundown APIs ==='
RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claims','{}',false);
DO $$ BEGIN PERFORM get_current_live_block('00000000-0000-0000-0000-000000000201'); RAISE NOTICE 'FAIL: anon read current block';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon blocked'; END $$;

\echo '=== R7: every block configuration and payload is validated ==='
RESET ROLE;
DO $$
DECLARE
  cases jsonb := '[
    {"kind":"text","config":{},"content":{"body":"Context"}},
    {"kind":"video","config":{},"content":{"youtube_id":"abc123"}},
    {"kind":"choice","config":{"options":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"max_selections":2},"answer":{"selections":["a","b"]}},
    {"kind":"open_text","config":{"max_length":500},"text":"Reason"},
    {"kind":"word_cloud","config":{"max_entries":3,"max_entry_length":40},"answer":{"entries":["justice"]}},
    {"kind":"scale","config":{"min":1,"max":5},"answer":{"value":4}},
    {"kind":"ranking","config":{"options":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"required_count":2},"answer":{"ranking":["b","a"]}},
    {"kind":"quiz","config":{"question_type":"true_false","correct_answer":"true","answer_window_sec":20},"answer":{"answer":"true"}}
  ]'::jsonb;
  item jsonb;
  snapshot jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(cases) LOOP
    IF NOT public.is_valid_live_block(item->>'kind',COALESCE(item->'config','{}'),COALESCE(item->'content','{}'))
      THEN RAISE EXCEPTION 'FAIL: valid % block rejected',item->>'kind';
    END IF;
    IF item ? 'answer' OR item ? 'text' THEN
      snapshot := jsonb_build_object('kind',item->>'kind','config',COALESCE(item->'config','{}'));
      IF NOT public.validate_live_block_response(snapshot,COALESCE(item->'answer','{}'),item->>'text')
        THEN RAISE EXCEPTION 'FAIL: valid % response rejected',item->>'kind';
      END IF;
    END IF;
  END LOOP;
  IF public.is_valid_live_block('choice','{"options":[{"id":"x","label":"X"}]}'::jsonb,'{}')
    THEN RAISE EXCEPTION 'FAIL: incomplete choice accepted';
  END IF;
  RAISE NOTICE 'PASS: all block validators enforced';
END $$;

\echo '=== R8: two host tabs cannot create duplicate activations ==='
CREATE FUNCTION test_activate_as(p_user uuid,p_session uuid,p_block uuid,p_request uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_user)::text,true);
  RETURN public.activate_live_block_v2(p_session,p_block,false,p_request);
END $$;
DO $$
DECLARE
  v_block_id uuid;
  first_result uuid;
  second_result uuid;
BEGIN
  SELECT id INTO v_block_id FROM public.live_session_blocks
    WHERE session_id='00000000-0000-0000-0000-000000000201' AND kind='text';
  PERFORM dblink_connect('host_tab_a','host=/tmp port='||current_setting('port')||' dbname='||current_database());
  PERFORM dblink_connect('host_tab_b','host=/tmp port='||current_setting('port')||' dbname='||current_database());
  PERFORM dblink_send_query('host_tab_a',format(
    'select test_activate_as(%L::uuid,%L::uuid,%L::uuid,%L::uuid)',
    '00000000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-000000000201',v_block_id,
    '00000000-0000-0000-0000-000000000401'));
  PERFORM pg_sleep(0.05);
  PERFORM dblink_send_query('host_tab_b',format(
    'select test_activate_as(%L::uuid,%L::uuid,%L::uuid,%L::uuid)',
    '00000000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-000000000201',v_block_id,
    '00000000-0000-0000-0000-000000000402'));
  SELECT result INTO first_result FROM dblink_get_result('host_tab_a') AS t(result uuid);
  SELECT result INTO second_result FROM dblink_get_result('host_tab_b') AS t(result uuid);
  PERFORM dblink_disconnect('host_tab_a'); PERFORM dblink_disconnect('host_tab_b');
  IF first_result IS DISTINCT FROM second_result OR
     (SELECT count(*) FROM public.live_block_runs br WHERE br.block_id=v_block_id)<>1 THEN
    RAISE EXCEPTION 'FAIL: concurrent activation created duplicate runs';
  END IF;
  RAISE NOTICE 'PASS: concurrent activation converged on one run';
END $$;

\echo '=== done ==='
