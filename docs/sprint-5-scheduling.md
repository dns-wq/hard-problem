# Sprint 5 — Scheduling + RSVP + .ics + Recap/CSV

Status: **IMPLEMENTED 2026-06-12.** Migration `009_live_scheduling.sql` verified on PG16
(`supabase/tests/009_live_scheduling_rls_test.sql`, 17/17 assertions pass). Depends on 007 (the recap
reads the quiz tables).

## Goal
Schedule a session in advance, let people RSVP, remind them, and after the session produce a recap +
CSV export.

## Key decisions
- **No new status.** "Scheduled" = `status='lobby' AND published AND starts_at>now()`. The session is
  still born in `lobby` (the 005 INSERT pin, the transition trigger, and the CHECK are all untouched) —
  it just sits unopened. Adding a `scheduled` status would have touched four coupled hardcodes for no gain.
- **Schedule columns are pinned.** `starts_at` / `published` / `reminders_sent_at` are NOT in the
  authenticated UPDATE grant — only the definer `schedule_live_session` RPC and the service-role reminder
  dispatch write them.
- **RSVP ≠ join.** `live_rsvps` mirrors `live_participants` (definer-only INSERT, own+host SELECT,
  withdraw-own DELETE); RSVPing does not create a participant row — the user still joins at session time.
- **Reminders are opportunistic** (Morris's call — no Vercel Cron): `live.dispatchDueReminders` fires
  when the host loads `/live` near session time. It uses the **service-role** client (notifications has
  no INSERT policy; `reminders_sent_at` is pinned) and is idempotent via `reminders_sent_at`. Reminders
  land as in-app `session_reminder` notifications (the existing bell + `/notifications` already poll).
  *Caveat: if the host never opens the dashboard near session time, no reminders go out.*
- **The CSV route re-asserts host.** It uses the service-role client (which BYPASSES RLS), so the route
  itself checks `host_id === user.id` (403 otherwise) — RLS is not the boundary there. The `.ics` route
  allows host OR an RSVP'd attendee. Email + mailing the invite are out of scope (no email infra).
- **The recap reuses the canonical aggregates** — `get_session_recap` returns the same scalar shape the
  transcript uses; CSV is per-participant (name, vote, note, spotlight counts), host-only.

## Data model (`009_live_scheduling.sql`)
- `live_sessions` += `starts_at`, `published`, `reminders_sent_at` (pinned) + a partial index.
- `live_rsvps` table + RLS.
- `notifications`: widen the type CHECK to add `session_reminder` (dynamic-drop of the auto-named
  constraint) + `session_id` column.
- RPCs: `schedule_live_session`, `rsvp_live_session`, `get_session_recap`, `get_my_upcoming_rsvps`.

## tRPC + routes + UI
- `liveRouter`: `schedule`, `rsvp`, `withdrawRsvp`, `myRsvps`, `recapSummary`, `dispatchDueReminders`;
  `create` extended (`startsAt`/`publish`), `mySessions` extended.
- API routes: `GET /api/live/[id]/ics` (host or RSVP'd; RFC-5545), `GET /api/live/[id]/recap` (host-only CSV).
- UI: `/live/new` "Schedule for later" datetime; `/live/rsvp?code=X` page (reserve + add-to-calendar +
  withdraw + join-when-live); `/live` "Your upcoming RSVPs" list + reminder dispatch on load; host lobby
  RSVP-share link; host ended-screen recap grid + "Export CSV"; `session_reminder` notification label.

## Security checklist (PG16, all pass)
`session_reminder` accepted; non-host can't schedule; pinned columns reject direct write (42501); RSVP
requires published + is idempotent + creates no participant row; RSVP visibility (own+host) + withdraw-own;
recap host-anytime / non-member forbidden; counts correct; upcoming-RSVPs returns the caller's own;
anon locked out of schedule/rsvp/recap.

## Before live
Apply `009_live_scheduling.sql` (after 008). Run `\d notifications` first to confirm the type-CHECK name
(the migration drops it dynamically, so this is informational). Requires `SUPABASE_SERVICE_ROLE_KEY`
(already used by the Stripe webhook). No cron; reminders are opportunistic — revisit Vercel Cron if
delivery reliability matters.
