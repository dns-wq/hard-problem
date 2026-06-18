-- Hard Problem: Guest (anonymous) join — frictionless live-session join.
-- Run after 009_live_scheduling.sql. Requires "Anonymous sign-ins" enabled in
-- the Supabase Auth settings.
--
-- Anonymous Supabase users have no email, but public.users.email is NOT NULL
-- UNIQUE, and the original handle_new_user() inserted NEW.email directly — so an
-- anonymous sign-up would fail and the guest could never get a profile row (and
-- thus could never join). This synthesizes a unique placeholder email and a
-- default display name for anonymous users; email users are unchanged.
--
-- CREATE OR REPLACE keeps the existing on_auth_user_created trigger binding.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    -- anonymous users (NEW.email IS NULL) get a unique, non-deliverable placeholder
    COALESCE(NEW.email, NEW.id::text || '@guest.hardproblem.club'),
    -- the name the guest typed (passed as auth metadata), else the email local
    -- part, else 'Guest'
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), split_part(NEW.email, '@', 1), 'Guest')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
