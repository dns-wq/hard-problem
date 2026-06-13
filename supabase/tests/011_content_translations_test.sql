-- Hard Problem: content_translations test
-- ⚠ LOCAL TEST ONLY. Creates the roles the migration grants to, runs 011, and
-- verifies the table constraints + the reviewed-only overlay shape. RLS itself is
-- not exercised here (superuser bypasses policies); the app overlay also filters
-- status='reviewed' explicitly, so this checks the data contract the overlay relies on.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;

\i ../migrations/011_content_translations.sql

\echo '=== C1: reviewed + machine rows coexist; the reviewed-only filter returns just the reviewed ==='
INSERT INTO content_translations (entity_type, entity_id, locale, field, value, status) VALUES
  ('topic', '00000000-0000-0000-0000-0000000000c1', 'zh-TW', 'title', '意識的困難問題', 'reviewed'),
  ('topic', '00000000-0000-0000-0000-0000000000c1', 'zh-TW', 'framing_note', '機器翻譯草稿', 'machine');
SELECT CASE WHEN count(*) = 1 AND min(value) = '意識的困難問題'
            THEN 'PASS: reviewed-only filter returns just the reviewed row'
            ELSE 'FAIL: '||count(*)||' rows' END
FROM content_translations
WHERE entity_type='topic' AND entity_id='00000000-0000-0000-0000-0000000000c1'
  AND locale='zh-TW' AND status='reviewed';

\echo '=== C2: status CHECK rejects an unknown status ==='
DO $$
BEGIN
  INSERT INTO content_translations (entity_type, entity_id, locale, field, value, status)
  VALUES ('topic', '00000000-0000-0000-0000-0000000000c2', 'zh-TW', 'title', 'x', 'bogus');
  RAISE EXCEPTION 'FAIL: bogus status was accepted';
EXCEPTION
  WHEN check_violation THEN RAISE NOTICE 'PASS: status CHECK rejects unknown status';
END $$;

\echo '=== C3: PK upsert updates value (re-translation overwrites in place) ==='
INSERT INTO content_translations (entity_type, entity_id, locale, field, value, status) VALUES
  ('quiz_question', '00000000-0000-0000-0000-0000000000c3', 'zh-TW', 'question_text', '初稿', 'machine');
INSERT INTO content_translations (entity_type, entity_id, locale, field, value, status) VALUES
  ('quiz_question', '00000000-0000-0000-0000-0000000000c3', 'zh-TW', 'question_text', '修訂稿', 'reviewed')
ON CONFLICT (entity_type, entity_id, locale, field)
  DO UPDATE SET value = EXCLUDED.value, status = EXCLUDED.status, updated_at = now();
SELECT CASE WHEN value = '修訂稿' AND status = 'reviewed' THEN 'PASS: upsert overwrites in place'
            ELSE 'FAIL: '||value||' / '||status END
FROM content_translations
WHERE entity_type='quiz_question' AND entity_id='00000000-0000-0000-0000-0000000000c3'
  AND locale='zh-TW' AND field='question_text';

\echo '=== C4: dotted JSONB fields and option.{label} fields store & retrieve ==='
INSERT INTO content_translations (entity_type, entity_id, locale, field, value, status) VALUES
  ('topic', '00000000-0000-0000-0000-0000000000c4', 'zh-TW', 'real_world_anchor.body', '案例內文', 'reviewed'),
  ('quiz_question', '00000000-0000-0000-0000-0000000000c4', 'zh-TW', 'option.A', '選項甲', 'reviewed');
SELECT CASE WHEN count(*) = 2 THEN 'PASS: dotted + option fields stored'
            ELSE 'FAIL: '||count(*) END
FROM content_translations
WHERE entity_id='00000000-0000-0000-0000-0000000000c4' AND field IN ('real_world_anchor.body','option.A');

\echo '=== done ==='
