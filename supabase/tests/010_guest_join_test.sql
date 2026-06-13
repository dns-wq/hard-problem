-- Hard Problem: handle_new_user (guest join) test
-- ⚠ LOCAL TEST ONLY. Stubs a minimal auth.users + public.users, runs 010, and
-- verifies the trigger handles email users (unchanged) and anonymous guests.

CREATE TABLE users (
  id           UUID PRIMARY KEY,
  email        TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role         TEXT DEFAULT 'user',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT,
  raw_user_meta_data JSONB DEFAULT '{}',
  is_anonymous       BOOLEAN DEFAULT false
);

\i ../migrations/010_guest_join.sql

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

\echo '=== G1: email user — email + display_name from metadata (unchanged behavior) ==='
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'alice@example.com', '{"display_name":"Alice"}');
SELECT CASE WHEN email='alice@example.com' AND display_name='Alice' THEN 'PASS: email user created'
            ELSE 'FAIL: '||email||' / '||display_name END
FROM users WHERE id='00000000-0000-0000-0000-0000000000a1';

\echo '=== G2: email user, no metadata — display_name falls back to email local part ==='
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000a2', 'bob@example.com');
SELECT CASE WHEN display_name='bob' THEN 'PASS: display_name from email local part' ELSE 'FAIL: '||display_name END
FROM users WHERE id='00000000-0000-0000-0000-0000000000a2';

\echo '=== G3: anonymous guest with a typed name — placeholder email + that name ==='
INSERT INTO auth.users (id, email, raw_user_meta_data, is_anonymous) VALUES
  ('00000000-0000-0000-0000-0000000000b1', NULL, '{"display_name":"Maya"}', true);
SELECT CASE WHEN email='00000000-0000-0000-0000-0000000000b1@guest.hardproblem.club' AND display_name='Maya'
            THEN 'PASS: guest created (placeholder email + typed name)'
            ELSE 'FAIL: '||email||' / '||display_name END
FROM users WHERE id='00000000-0000-0000-0000-0000000000b1';

\echo '=== G4: anonymous guest with no name → "Guest" ==='
INSERT INTO auth.users (id, email, raw_user_meta_data, is_anonymous) VALUES
  ('00000000-0000-0000-0000-0000000000b2', NULL, '{}', true);
SELECT CASE WHEN display_name='Guest' AND email LIKE '%@guest.hardproblem.club'
            THEN 'PASS: nameless guest defaults to Guest'
            ELSE 'FAIL: '||email||' / '||display_name END
FROM users WHERE id='00000000-0000-0000-0000-0000000000b2';

\echo '=== G5: two nameless guests get distinct (unique) placeholder emails ==='
INSERT INTO auth.users (id, email, is_anonymous) VALUES
  ('00000000-0000-0000-0000-0000000000b3', NULL, true);
SELECT CASE WHEN count(DISTINCT email)=2 THEN 'PASS: guest placeholder emails are unique' ELSE 'FAIL' END
FROM users WHERE id IN ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b3');

\echo '=== done ==='
