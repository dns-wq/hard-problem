# Sprint 4 — Profile Transcript + Stamps

Status: **IMPLEMENTED 2026-06-12.** Migration `008_live_transcript.sql` verified on PG16
(`supabase/tests/008_live_transcript_rls_test.sql`, 6/6 assertions pass).

## Goal
Surface a user's live-session participation as a "continuing-education transcript" + stamps on their
profile — sessions attended, votes cast, times called on / shared, quizzes passed.

## Key decisions
- **Derive on read. Zero tables, zero triggers, zero realtime.** One `STABLE SECURITY DEFINER` RPC
  (`get_live_transcript`) aggregates the existing live tables on page load.
- **Structurally cannot leak.** The RPC returns ONLY scalar BIGINT counts + `is_public` — no
  `option_id` / `session_id` / `topic` — so the transcript can never reveal *how* or *where* you voted,
  even on your own profile (the live invariant "the room sees aggregates, never rows", extended to profiles).
- **Opt-IN** (Morris's call): `users.live_transcript_public` defaults `false`. A non-self viewer of an
  opted-out target gets an all-zero row with `is_public=false` (not an error, not empty), so a public
  page degrades cleanly to "no transcript" without a 404 and without revealing the toggle state.
- **Stamps live in code** (`src/lib/stamps.ts`), not the DB — thresholds/copy retune in one edit,
  retroactively, no migration. `evaluateStamps(counts)` is shared by both profile procedures.
- **Canonical count semantics** (shared with the Sprint 5 recap, defined once): `times_spotlighted`
  excludes `cleared`; `times_shared` = `outcome='shared' OR note_shared`; `steelman` =
  `minority_steelman AND outcome='shared'`; `quiz_passed_topics` = `user_progress.quiz_passed` count.

## Data model (`008_live_transcript.sql`)
- `users` += `live_transcript_public BOOLEAN NOT NULL DEFAULT false` (owner-writable via the existing
  "Users update own profile" policy).
- Three user-keyed indexes (the existing live indexes are session-keyed).
- `get_live_transcript(p_user_id)` RPC.

## tRPC + UI
- `profile.update` += `live_transcript_public`; new `profile.liveTranscript` (own); `profile.publicProfile`
  extended with a parallel transcript read — it **tolerates a logged-out viewer** (the RPC is
  authenticated-only; the destructure swallows the anon error so the public page still renders, just
  without the transcript).
- `LiveTranscript` component: a stat grid + stamp shelf. `/profile` (own, shows even when private with a
  "publish in settings" note); `/profile/[displayName]` (renders nothing when `transcript` is null — no
  placeholder reveals the opt-out); `/settings` checkbox.

## Security checklist (PG16, all pass)
anon denied; self sees own counts (spotlit excludes cleared, shared/steelman correct); other viewer of
an opted-out target gets zeros + `is_public=false` (not error); opted-in target visible to others;
a non-owner can't flip another's flag; missing user → `not_found`.

## Before live
Apply `008_live_transcript.sql` (after 007). No realtime/publication change. Live-quiz-specific stamps
are deferred — a one-line catalog edit + one count once richer signals are wanted.
