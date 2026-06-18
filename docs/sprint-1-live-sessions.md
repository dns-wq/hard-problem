# Sprint 1 — Live Sessions: Foundation (Session + Lobby + Stance Vote)

**Status:** v1.3 — IMPLEMENTED. v1.2 was the build contract (4-lens adversarial
review, 35 findings + empirical PG16 delta-verification, 7 findings). v1.3
records the post-implementation review (3 reviewers, 23 findings triaged) and
the deviations accepted during implementation — see §15.
**Date:** 2026-06-12
**Author:** Morris + Claude (codebase-grounded plan)

---

## 1. Goal

Build the smallest vertical slice of the Live Session feature that proves the
host-screen ⇄ phones ⇄ Supabase Realtime triangle on our real stack:

> A host creates a session for a topic, projects a QR code, participants scan
> it on their phones, vote on a stance question (with an optional short note),
> and the host screen tallies votes live. The host reveals results to all
> phones, then ends the session.

**Exit criterion (demo script, run on real devices):** two phones join via QR,
vote, change a vote, the host screen tally updates within ~2 s, host hits
Reveal and both phones show the result bars. A phone that is locked/refreshed
mid-session recovers to the correct state on reopen.

This sprint retires all infrastructure risk (channel architecture, RLS for
shared-room data, reconnect behavior). Sprints 2–5 (spotlight draw, live quiz,
transcript, scheduling/recap) are modules on top of this engine and are
**out of scope** here.

---

## 2. Scope

### In scope
- New migration `005_live_sessions.sql` (4 tables, 2 RLS helper functions,
  3 RPCs, 1 transition trigger, realtime publication) + `src/types/database.ts`
  mirror update (and fix its stale header comment to reference the migrations
  directory generally, not 001 alone).
- New tRPC router `live` registered in `root.ts`.
- Three routes: `/live` (join by code + "sessions you host" list), `/live/new`
  (create session), `/live/host/[code]` (projector screen), `/live/play/[code]`
  (phone view).
- New component folder `src/components/live/`.
- One new dependency: `react-qr-code` (inline SVG QR — themes with our CSS vars).
- "Host live session" entry point on the topic page.
- Fix pre-existing login redirect bug **including the server-side open-redirect
  hole in `/auth/callback`** (required for the QR deep-link flow; see §8).
- `middleware.ts` clauses for the new routes (preserving the query string).

### Out of scope (explicitly deferred)
- Spotlight/raffle draw, live quiz, preset-reaction applause (Sprints 2–3).
- Scheduling, `.ics`, recap page, CSV export (Sprint 5).
- Anonymous / guest join (see Decision D1).
- Multiple vote rounds per session (schema is genuinely forward-compatible
  now — PK includes `round_number`; see D4).
- Editing the session question after creation (host sets it on `/live/new`;
  no update procedure in Sprint 1).
- Surfacing live-vote results on the topic page (residue stays in `live_*`
  tables; product surfacing comes with the recap work).
- Broadcast-from-database / private realtime channels (revisit before any
  500+ person event; see §10).

---

## 3. Key design decisions

### D1. Authenticated participants only (defer anonymous join)
Joining requires a normal Hard Problem account (email/password or
GitHub/Google OAuth).

**Why:** Supabase anonymous sign-in is currently *impossible* in this schema —
the `handle_new_user()` trigger inserts `NEW.email` into `users.email`
(`NOT NULL UNIQUE`), so anonymous users (null email) would fail the trigger.
Supporting them means altering the users table + trigger + a "claim account"
flow — a sprint of its own. Requiring accounts also *is* the product's residue
principle: every scanned QR is an onboarding funnel. OAuth is two taps.

**Consequence:** the QR/login deep-link must work — see §8 (redirect fixes).

### D2. Vote options are snapshotted into the session, not FK'd to stance tags
There is **no stance_tags table** — `contributions.stance_tag` is free text,
distributions are computed on the fly, and the admin merge tool rewrites tag
strings in place with no history. A live vote therefore cannot reference a
stance tag by id.

At session creation, the host is shown the topic's current top stance tags
(via the existing `contributions.stanceTags` aggregation) as *suggestions*,
can edit/remove/add options freely (min 2, max 6), and the chosen labels are
stored in `live_session_options`. The original tag string, if any, is kept in
`source_stance_tag` for provenance. Topics with zero discussion activity work
fine (host types options manually — the topic's `discussion_prompt` is shown
for inspiration).

**Rejected alternative:** introducing a canonical `stance_tags` table — a
schema departure that would also force rework of the Composer free-text entry,
the public aggregation, and the admin merge tool. Not a Sprint 1 problem.

### D3. Realtime is a nudge; the database (via tRPC) is the only source of truth
This codebase already treats realtime as a refetch hint, not state transport
(NotificationBell bumps a counter; the list is fetched via tRPC). Live
sessions follow the same philosophy, which buys us reconnect-correctness for
free:

- **All state changes are tRPC mutations** writing to Postgres under RLS.
- **Phones** subscribe to `postgres_changes` UPDATE events on `live_sessions`
  **with a server-side filter** `id=eq.{sessionId}`; on any event they
  invalidate the session query. State transitions are rare (a few per
  session), so this is cheap at seminar scale (see §10 for the real numbers).
- **Host screen** subscribes to INSERT+UPDATE on `live_responses` and INSERT
  on `live_participants` filtered by `session_id=eq.{sessionId}`, and
  debounces into a tally/count refetch (max ~1 refetch/sec). Only the host
  holds these subscriptions — vote volume never fans out to N phones.
- **Reveal:** flipping `live_sessions.status` to `revealed` is itself the
  UPDATE event phones react to; they then fetch the tally via tRPC (gated
  server-side to revealed status — see §4).
- A reconnecting phone simply remounts, fetches session + own vote via tRPC,
  and resubscribes. No missed-message problem exists because messages carry no
  state.

**Departures from existing code, on purpose:** NotificationBell subscribes
*unfiltered* and filters client-side, and reuses a static channel topic — the
review flagged both as smells (scaling/authz, and a channel-reuse race under
remounts). New code uses server-side filters and per-mount channel topics
(§6); do not copy those parts of the NotificationBell shape.

**Note:** no table in this repo is in the `supabase_realtime` publication
(notifications was evidently enabled via dashboard). The 005 migration adds
the `live_*` tables to the publication **in code** so fresh environments work
(§4, deploy note).

### D4. One stance-vote round per session, schema ready for more
Session status *is* the round state machine:

```
lobby → voting → revealed → ended
            ↑        |
            └────────┘   (reopen voting)
```

- `lobby → voting`, `voting → revealed`, `revealed → voting` (**reopen**), and
  `* → ended` (from any non-ended state) are the legal transitions; `ended` is
  terminal.
- **Why reopen is allowed:** "Reveal" would otherwise be an irreversible
  mis-click with no recovery mid-seminar. Reopening is one transition-map
  entry, fully RLS-compatible (the vote-window policies key off status, so
  they reopen automatically), and phones recover via the same UPDATE nudge.
  The host UI confirms both Reveal and End with the house `.modal` dialog
  (both change what the room sees; End is irreversible).
- The transition map is enforced **in the database** by a `BEFORE UPDATE`
  trigger (§4), not just in tRPC — a host hitting PostgREST directly cannot
  invent transitions like `lobby → revealed`.
- `live_responses` has PRIMARY KEY `(session_id, user_id, round_number)` with
  `round_number DEFAULT 1`, so multi-round (Sprint 2+) is a code change, not a
  schema migration. Sprint 1 always writes round 1 (upsert
  `onConflict: 'session_id,user_id,round_number'`).

### D5. Vote privacy: individual votes visible to host only; room sees aggregates
Participants can read only their own response row. The host can read all
responses in their own session (needed for live tally now, spotlight draw in
Sprint 2). Phones get aggregate counts only, and only once status is
`revealed`/`ended`, via a `SECURITY DEFINER` RPC (`get_live_tally`).
Notes (≤140 chars) are never shown to the room in Sprint 1 — they exist for
the Sprint 2 spotlight (which will surface a *drawn* participant's note with
their consent: "share or pass").

**Known, accepted race:** the vote-window check is a status subquery under
READ COMMITTED, so a vote in flight at the exact moment of Reveal can land
just after the host sees the bars. The next debounced refetch self-heals the
tally. A hard cutoff would need a locking SECURITY DEFINER vote path — not
worth it, especially since D4 allows reopening anyway. Documented so nobody
files it as a bug.

### D6. The session code is a held capability, not a readable column
The 6-char code is the room key — so **no RLS policy may expose it to
non-members**. (v1.0 of this spec had `SELECT USING (true) TO authenticated`
on `live_sessions`; review showed that lets any logged-in user
`SELECT code FROM live_sessions WHERE status = 'voting'` and enumerate every
live room. Killed.)

The model is:
- Row-level read access to `live_sessions` / `live_session_options` /
  `live_participants` / `live_responses` is **member-scoped** (host or joined
  participant), via SECURITY DEFINER helper predicates (§4) — *not* by
  cross-referencing the tables in each other's policies, which Postgres
  rejects as infinitely recursive (42P17).
- **Pre-join interactions present the code itself** through rate-limited
  SECURITY DEFINER RPCs: `get_live_session_by_code` (lookup/preview) and
  `join_live_session` (join). After joining, normal member-scoped RLS reads
  (and the phones' filtered realtime subscription, which is checked against
  the same SELECT policy) all pass.
- `join_live_session` also snapshots `display_name` **server-side** from
  `users` — the client never supplies it, so the roster can't be spoofed.
- Rate limiting lives **inside** `get_live_session_by_code` (per-user
  fixed-window counter table; serverless-proof, no in-memory state), so the
  code lookup can't be brute-forced via tRPC *or* direct PostgREST.

### D7. Any authenticated user can host
Professors, meetup organizers, and trainers are the audience — hosting is not
an editor/admin privilege. Abuse surface is low *given D6* (sessions are not
enumerable; a session is scoped to people who hold its code). Flagged as a
product toggle if this proves wrong.

---

## 4. Data model — `supabase/migrations/005_live_sessions.sql`

Follow house conventions exactly: header comment (`-- Hard Problem: Live
Sessions` + run instructions), `-- ===== Section =====` dividers, TEXT + CHECK
(never CREATE TYPE), `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`,
TIMESTAMPTZ DEFAULT now(), `idx_<table>_<col>` index names, sentence-case
quoted policy names, comment above each function naming its tRPC caller.

### Tables

#### `live_sessions`
| column | type | notes |
|---|---|---|
| id | UUID PK default gen_random_uuid() | |
| code | TEXT UNIQUE NOT NULL | 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L); generated server-side, retry on 23505. **Never readable by non-members (D6)** |
| topic_id | UUID NOT NULL FK topics(id) ON DELETE CASCADE | |
| host_id | UUID NOT NULL FK users(id) ON DELETE CASCADE | |
| status | TEXT NOT NULL CHECK IN ('lobby','voting','revealed','ended') DEFAULT 'lobby' | transitions trigger-enforced (below) |
| question | TEXT NOT NULL DEFAULT '' | set at create (defaults to topic's discussion_prompt, host-edited on the create form); not editable after creation in Sprint 1 |
| created_at / updated_at | TIMESTAMPTZ DEFAULT now() | app code sets updated_at (no trigger — house rule) |
| ended_at | TIMESTAMPTZ | set when status → ended |

Indexes: `idx_live_sessions_host` ON (host_id), `idx_live_sessions_topic` ON (topic_id).

#### `live_session_options`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| session_id | UUID NOT NULL FK live_sessions(id) ON DELETE CASCADE | |
| label | TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 100) | |
| source_stance_tag | TEXT | provenance only; tolerate drift |
| display_order | INTEGER NOT NULL DEFAULT 0 | |
| UNIQUE (session_id, label) | | |

Index: `idx_live_session_options_session` ON (session_id).

#### `live_participants`
| column | type | notes |
|---|---|---|
| session_id | UUID NOT NULL FK live_sessions(id) ON DELETE CASCADE | |
| user_id | UUID NOT NULL FK users(id) ON DELETE CASCADE | |
| display_name | TEXT NOT NULL | snapshotted **server-side** by `join_live_session` (D6) |
| joined_at | TIMESTAMPTZ DEFAULT now() | |
| PRIMARY KEY (session_id, user_id) | | composite-PK join-table convention |

Index: `idx_live_participants_session` ON (session_id).

#### `live_responses`
| column | type | notes |
|---|---|---|
| session_id | UUID NOT NULL FK live_sessions(id) ON DELETE CASCADE | |
| user_id | UUID NOT NULL FK users(id) ON DELETE CASCADE | |
| option_id | UUID NOT NULL FK live_session_options(id) **ON DELETE RESTRICT** | RESTRICT: an option with votes can never be silently deleted out from under the tally |
| note | TEXT CHECK (note IS NULL OR char_length(note) <= 140) | |
| round_number | INTEGER NOT NULL DEFAULT 1 | |
| created_at / updated_at | TIMESTAMPTZ DEFAULT now() | |
| PRIMARY KEY (session_id, user_id, round_number) | | one vote per user per round (D4) |

Index: `idx_live_responses_session` ON (session_id).

#### `live_code_attempts` (rate-limit ledger for D6)
| column | type | notes |
|---|---|---|
| user_id | UUID NOT NULL FK users(id) ON DELETE CASCADE | |
| window_start | TIMESTAMPTZ NOT NULL | minute bucket: `date_trunc('minute', now())` |
| attempts | INTEGER NOT NULL DEFAULT 1 | |
| PRIMARY KEY (user_id, window_start) | | |

RLS enabled, **no policies** (house precedent: intentionally-absent policies
mean "writes only via definer paths" — see notifications/ai_usage in 001).
Only `get_live_session_by_code` touches it, which also opportunistically
deletes the caller's buckets older than 1 hour on each call (keeps the ledger
tiny; no cron needed).

### RLS helper predicates (break the cross-table recursion)

Member-scoped policies on `live_sessions` and `live_participants` cannot
reference each other directly — Postgres evaluates the referenced table's RLS
inside the subquery and detects infinite recursion (42P17). Standard fix: tiny
`SECURITY DEFINER` boolean predicates that bypass RLS for the membership
lookup only.

```sql
-- Used by RLS policies below. SECURITY DEFINER to break policy recursion.
CREATE FUNCTION public.is_live_session_host(p_session_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.live_sessions
                     WHERE id = p_session_id AND host_id = auth.uid()) $$;

CREATE FUNCTION public.is_live_session_participant(p_session_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.live_participants
                     WHERE session_id = p_session_id AND user_id = auth.uid()) $$;
```

(`auth.uid()` works inside SECURITY DEFINER — it reads the per-request
`request.jwt.claims` GUC, which is independent of the executing role.)

**Hardening (applies to these and all RPCs below):** `SET search_path = ''`
with fully-qualified object names, and
`REVOKE EXECUTE ... FROM public, anon; GRANT EXECUTE ... TO authenticated;`.
(The existing 001/003 functions skip search_path pinning — the Supabase linter
flags that pattern; new functions do it right. Do not "fix" the old ones in
this PR.)

### RLS policies (enable RLS on all five tables)

`live_sessions`
- `"Members read own sessions"` — SELECT USING
  `(host_id = auth.uid() OR public.is_live_session_participant(id))`.
  *(This is also the policy the phones' postgres_changes subscription is
  checked against — joined participants pass.)*
  ⚠ **The host disjunct MUST be the direct column test, not
  `is_live_session_host(id)`** — verified on PG16: Postgres applies SELECT
  policies to `INSERT … RETURNING` rows, and a STABLE definer function cannot
  see the calling statement's own write, so the helper-based policy makes
  `create`'s `.insert().select()` fail with 42501. The helper exists to break
  recursion on the *other* tables; on `live_sessions` itself the column is
  local.
- `"Users create own sessions"` — INSERT WITH CHECK:
  ```sql
  host_id = auth.uid()
  AND status = 'lobby'                -- sessions cannot be born revealed/ended
                                      -- (the trigger only guards UPDATEs)
  AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_id)
  -- runs under topics RLS for the inserter → blocks hosting on a draft topic
  -- via direct PostgREST (FKs alone ignore RLS); no recursion (topics
  -- policies don't touch live_*)
  ```
- `"Hosts update own sessions"` — UPDATE USING (host_id = auth.uid()).
  (With no WITH CHECK, USING doubles as the new-row check — verified: a host
  cannot hand off host_id.) Transition validity is enforced by the trigger
  below, not the policy.
- **Column-level grant (required):** RLS gates rows, not columns — without
  this, a host can rewrite `question`, `code`, or `topic_id` mid-session via
  PostgREST (inverting what the votes meant, or orphaning every phone's URL):
  ```sql
  REVOKE UPDATE ON public.live_sessions FROM authenticated;
  GRANT UPDATE (status, updated_at, ended_at) ON public.live_sessions TO authenticated;
  ```
  Belt-and-braces: `CHECK (code ~ '^[A-HJ-KM-NP-Z2-9]{6}$')` on the table.
- No DELETE policy (sessions are ended, not deleted; verified the id PK +
  no-DELETE combination also blocks delete-and-reinsert trigger bypass).

`live_session_options`
- `"Members read session options"` — SELECT USING
  `(public.is_live_session_host(session_id) OR public.is_live_session_participant(session_id))`.
- `"Hosts manage options in lobby"` — ALL USING/WITH CHECK
  `(public.is_live_session_host(session_id) AND
    (SELECT status FROM public.live_sessions WHERE id = live_session_options.session_id) = 'lobby')`.
  *(Options are immutable once voting opens — protects vote integrity and the
  Sprint 2 spotlight data; belt-and-braces with the RESTRICT FK.)*

`live_participants`
- `"Own row and host visibility"` — SELECT USING
  `(user_id = auth.uid() OR public.is_live_session_host(session_id))`.
- **No INSERT policy** — joins go exclusively through `join_live_session`
  (D6; house precedent for intentionally-absent policies).

`live_responses`
- `"Own responses and host visibility"` — SELECT USING
  `(user_id = auth.uid() OR public.is_live_session_host(session_id))`.
- `"Participants vote while voting open"` — INSERT WITH CHECK:
  ```sql
  user_id = auth.uid()
  AND public.is_live_session_participant(session_id)
  AND (SELECT status FROM public.live_sessions
       WHERE id = live_responses.session_id) = 'voting'
  AND EXISTS (SELECT 1 FROM public.live_session_options o
              WHERE o.id = live_responses.option_id
                AND o.session_id = live_responses.session_id)
  AND round_number = 1
  ```
  *(`round_number = 1` is pinned in the policy for Sprint 1 — without it, a
  participant hitting PostgREST directly could insert extra rows under rounds
  2, 3, … and stuff the vote. Sprint 2 relaxes this to "current round" when
  multi-round lands.)*
- `"Participants change vote while voting open"` — UPDATE USING
  `(user_id = auth.uid())` WITH CHECK *(identical predicate to INSERT)* — so a
  changed row must still be the caller's, in a session they joined, while
  voting is open, with an option belonging to **that** session, in round 1.

> ⚠ **Correlation-name discipline (review finding, was a real hole):** inside
> a policy subquery, an unqualified column binds to the *innermost* table that
> has it — `WHERE p.session_id = session_id` inside a subquery on
> `live_participants p` is the tautology `p.session_id = p.session_id`, which
> silently turns "participant of this session" into "participant of any
> session". **Always qualify outer references with the policy's table name**
> (`live_responses.session_id`), as written above. Re-check every policy for
> this before merge (it's §9 item 1).

> The option-belongs-to-session check lives in **RLS**, not just tRPC — a
> participant hitting PostgREST directly cannot file a vote in session X with
> an option from session Y.

### State-machine trigger

```sql
-- Enforces D4's transition map at the DB level (tRPC validates too, for clean errors).
CREATE FUNCTION public.enforce_live_session_transition() ...
-- BEFORE UPDATE OF status ON live_sessions:
--   allowed: lobby→voting, voting→revealed, revealed→voting,
--            (lobby|voting|revealed)→ended; same-status no-op allowed.
--   otherwise RAISE EXCEPTION 'invalid session transition % → %'.
```

### RPCs (all SECURITY DEFINER, hardened as above, comment naming the tRPC caller)

#### `get_live_session_by_code(p_code TEXT)`
Rate-limited code lookup (the only pre-join read path; D6).
1. Resolve the code first (uppercase-normalize in the caller). **If the caller
   is already host/participant of the matched session, skip the rate-limit
   charge entirely** — review finding: members poll every 5 s (§6), plus
   focus/nudge refetches, so charging them trips the limit mid-seminar for
   honest phones. A member by definition already holds the code, so exempting
   them creates no oracle. Misses and non-member hits still count.
2. For charged calls: upsert-increment `live_code_attempts` for
   `(auth.uid(), date_trunc('minute', now()))`; if attempts > 30 →
   `RAISE EXCEPTION 'rate_limited'`.
3. Returns `(id, status, question, topic_id, topic_title, topic_slug,
   is_host, is_participant)` — **not** the full row, and never other users'
   data. Returns empty set when not found (a miss and a nonexistent code are
   indistinguishable, by design).

> Better still: pages should stop calling this once joined — see `bySessionId`
> in §5; after join, everything is plain member-scoped RLS reads.

#### `join_live_session(p_session_id UUID)`
1. `SELECT status INTO v_status … ; IF NOT FOUND THEN RAISE EXCEPTION
   'not_found';` — review finding: a bare `status NOT IN (…)` check evaluates
   NULL for a nonexistent id and falls through to a raw FK error.
2. If a `live_participants` row already exists for `(p_session_id, auth.uid())`
   → return success (**no-op**, regardless of status — this is the reconnect
   path; review finding).
3. Else if v_status NOT IN ('lobby','voting') → `RAISE EXCEPTION 'session_closed'`.
4. Else INSERT with `display_name` read from `public.users` (server-side
   snapshot, D6), `ON CONFLICT DO NOTHING` (race-safe).

#### `get_live_tally(p_session_id UUID)`
1. Guard: caller is host **or** session status IN ('revealed','ended');
   otherwise `RAISE EXCEPTION` (maps to FORBIDDEN in tRPC — distinct from a
   legitimately zero-vote tally; review finding).
2. **LEFT JOIN from `live_session_options`** so zero-vote options are present
   with count 0 (a reveal with no votes renders all bars, not missing bars).
   Counts only `round_number = 1` rows (defense in depth with the policy pin).
3. Returns TABLE(option_id UUID, label TEXT, display_order INTEGER,
   vote_count BIGINT, participant_count BIGINT) — participant_count repeated
   per row (or returned via a second definer function if cleaner; either way
   the host screen gets votes-cast vs joined from one call).

### Realtime publication

```sql
-- Idempotent: dashboard experiments may have already added a table (42710).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- ... same for live_responses, live_participants
```

Default REPLICA IDENTITY is sufficient (we consume INSERTs and new-record
UPDATEs only).

**Deploy check (staging + prod, day 1):**
```sql
SELECT pubname, pubinsert, pubupdate FROM pg_publication
WHERE pubname = 'supabase_realtime';
```
Both `pubinsert` AND `pubupdate` must be true — the dashboard exposes
per-operation toggles, and notifications only ever needed INSERT, so UPDATE
publishing may never have been verified on this project.

---

## 5. tRPC — `src/lib/trpc/routers/live.ts` → `liveRouter`, key `live` in root.ts

All procedures `protectedProcedure` (D1, D7). Zod inputs inline; ids
`z.string().uuid()`; after each Supabase call `if (error) throw error`;
business failures via `TRPCError` (NOT_FOUND/BAD_REQUEST/FORBIDDEN); writes
double-guarded with explicit `.eq(...)` alongside RLS (house pattern); RPC
exceptions (`rate_limited`, `session_closed`, tally guard) mapped to clean
TRPCError messages.

| procedure | type | input | behavior |
|---|---|---|---|
| `create` | mutation | `{ topicId, question?, options: [{ label, sourceStanceTag? }] (2–6) }` | verify topic exists + published; generate code (retry ≤3 on 23505); insert session (question defaults to topic.discussion_prompt) + options; return `{ id, code }` |
| `byCode` | query | `{ code }` | **pre-join resolution only.** Normalize to uppercase; call `get_live_session_by_code` (rate-limited for non-members). Returns the preview shape (enough for the join screen) + `{ isHost, isParticipant }`. NOT_FOUND on empty |
| `bySessionId` | query | `{ sessionId }` | **the steady-state query** both screens use after resolution/join — plain member-scoped RLS reads, no RPC, no rate-limit ledger writes. Returns `{ session, options (ordered), myResponse, isHost }`; host additionally gets participant count. NOT_FOUND if RLS hides the row |
| `join` | mutation | `{ sessionId }` | call `join_live_session` RPC; treat `session_closed` as BAD_REQUEST "This session has ended"; already-participant = success (no-op) |
| `setStatus` | mutation | `{ sessionId, status }` | host-only (explicit host_id check → FORBIDDEN); validate transition against D4's map (BAD_REQUEST with a human message; the DB trigger is the backstop); set updated_at; set ended_at when ending |
| `vote` | mutation | `{ sessionId, optionId, note? (≤140) }` | upsert live_responses (`onConflict: 'session_id,user_id,round_number'`, round_number 1) with updated_at; RLS independently enforces participant + voting-open + option-in-session — surface RLS rejection (42501) as BAD_REQUEST "Voting is closed" |
| `tally` | query | `{ sessionId }` | `ctx.supabase.rpc('get_live_tally', { p_session_id })`; map guard exception → FORBIDDEN; returns `[{ optionId, label, count }]` + `total` + `participantCount` |
| `mySessions` | query | — | sessions hosted by caller (id, code, status, topic title), newest first, limit 20. **Rendered on `/live`** (§7) — host recovery for a lost projector tab |

Page data flow: both `/live/host/[code]` and `/live/play/[code]` resolve the
URL's code **once** via `byCode`, then run on `bySessionId` (+ realtime nudges
+ poll) for the rest of the session.

One-line `//` comment above each procedure stating intent + auth level
(house style).

---

## 6. Realtime hooks — `src/components/live/`

Two client hooks. They follow the NotificationBell *placement* conventions
(client component, `createClient()` inside `useEffect`, cleanup via
`supabase.removeChannel(channel)`) but fix two review-confirmed problems with
that pattern — copy *this* shape, not the bell's:

1. **Per-mount unique channel topics.** `@supabase/ssr`'s browser client is a
   singleton, and realtime-js *reuses* a channel instance for an
   already-registered topic while `removeChannel` tears down asynchronously.
   Under React StrictMode's double-mount in `next dev`, a fixed topic name
   gets the still-leaving channel back — `.on('postgres_changes', …)` then
   either throws ("cannot add callbacks after subscribe") or `.subscribe()`
   silently no-ops, leaving the screen with **no live subscription** (masked
   by the polling fallback, degrading the 2 s exit criterion to 5 s). Topic
   names for postgres_changes are client-local, so uniqueness costs nothing:

   ```ts
   const topic = `live-session-${sessionId}-${crypto.randomUUID()}`;
   ```

2. **Subscribe with a status callback** and resubscribe on
   `CHANNEL_ERROR`/`TIMED_OUT`; log `CLOSED` in dev.

```ts
// usePlaySessionChannel(sessionId, handlers) — phone + host screens
supabase.channel(topic)
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'live_sessions',
        filter: `id=eq.${sessionId}` },
      (payload) => handlersRef.current.onSession(payload.new))
  .subscribe(statusCallback);
```

```ts
// useHostSessionChannel(sessionId, onActivity) — host screen only; skip when !isHost
supabase.channel(topic)
  .on('postgres_changes', { event: 'INSERT', schema: 'public',
      table: 'live_responses', filter: `session_id=eq.${sessionId}` }, bump)
  .on('postgres_changes', { event: 'UPDATE', schema: 'public',
      table: 'live_responses', filter: `session_id=eq.${sessionId}` }, bump)  // vote changes
  .on('postgres_changes', { event: 'INSERT', schema: 'public',
      table: 'live_participants', filter: `session_id=eq.${sessionId}` }, bump)
  .subscribe(statusCallback);
// bump = debounced (1s trailing) refetch of live.tally + participant count
```

Implementation rules (each one is a review finding):
- **Decide from the payload, not component state:** "invalidate tally when
  revealed" reads `payload.new.status` — never a status captured in a closure
  (the channel outlives renders).
- Keep handler callbacks in a **ref** so the effect deps stay `[sessionId]`
  without stale closures.
- **Clear the debounce timer in the same cleanup** that calls
  `removeChannel` (otherwise a trailing refetch fires after End → navigation).
- Realtime JWT handling (initial token + refresh mid-session) is automatic in
  supabase-js ≥2.x via the accessToken callback — **do not** call
  `realtime.setAuth()` manually.
- Belt-and-braces: while status is `lobby`/`voting`, run the relevant queries
  with `refetchInterval: 5000` so a dropped websocket degrades to polling, not
  a frozen screen. Drop the interval once `revealed`/`ended`. The polled query
  is `bySessionId` (plain RLS reads) — never `byCode`, whose RPC writes the
  rate-limit ledger on every call.
- **Subscribe (or force one refetch) only after `join` succeeds** — WALRUS
  checks the SELECT policy against *current* membership per change, so events
  emitted between subscribing and the join committing are silently dropped,
  not queued. Subscribing first can eat the lobby→voting flip and leave the
  phone stale until the next poll.

---

## 7. Routes & UI

House conventions: every page `'use client'`, default-export `XPage()`,
`useParams<{ code: string }>()`, wrap in `.page-narrow` (phone pages) /
`.page` (host screen), tRPC hooks for all data, inline `style={{}}` + CSS
variables, **no Tailwind utilities**, new reusable styles as a
`/* ===== Live ===== */` block in `globals.css`. New components go in
`src/components/live/` (feature folder; `components/ui/` stays empty).
Loading = muted `<p>`; errors = centered `.page-narrow` + `.btn` link.

**Next 16.2.2 build gotcha (review-confirmed):** a statically prerendered
client page calling `useSearchParams()` without a `<Suspense>` boundary
**fails `next build`**. Every page below that reads search params
(`/live/new`, and the §8 auth pages) must render its param-consuming
component inside a Suspense boundary (thin default-export wrapper).

### `/live` — join page + host recovery
- Code-entry form (`auth-container` / `auth-input` styles): uppercases input,
  **client-side format validation only** (6 chars, allowed alphabet), then
  navigates to `/live/play/[code]`. The authoritative exists/not-found check
  happens on the play page after its auth gate — `byCode` is a protected
  procedure, so a signed-out visitor here can't look codes up (by design).
- When signed in: a "Sessions you host" list below the form (code, topic
  title, status → links to `/live/host/[code]`), from `mySessions`. This is
  the lost-projector-tab recovery path.

### `/live/new?topic={slug}` — create session (auth-gated; Suspense-wrapped params)
Topic resolved via existing `topics.bySlug`. Question field prefilled with
`discussion_prompt`. Option editor: suggestions from `contributions.stanceTags`
rendered as add-able chips, free-text add, up/down ordering buttons, min 2 /
max 6 enforced in UI + zod. Submit → `live.create` →
`router.push('/live/host/' + code)`.
Entry point: "Host live session" `.btn` on `/topics/[slug]` (visible to
signed-in users).

### `/live/host/[code]` — projector screen (auth-gated)
**Non-hosts are redirected to `/live/play/[code]`** (review finding: a
non-host "mirror" would be blind during lobby/voting — tally and roster are
host-gated — so the mirror idea is cut; a second projector signs in as the
host account).

Layout optimized for distance reading (intentionally larger type than the rest
of the app):
- **Lobby:** big QR (react-qr-code SVG, `fgColor='var(--text-primary)'`,
  `bgColor='transparent'`) encoding `${origin}/live/play/${code}`; the code in
  huge letters as fallback; live participant count; topic title + question;
  "Open voting".
- **Voting:** live tally bars (`TallyBars` component — visual language
  borrowed from `DiscussionLandscape`: proportional horizontal bars + counts),
  votes-cast / joined counter, "Reveal results" + "End session".
- **Revealed:** final bars + totals; "Reopen voting" + "End session".
- **Ended:** summary line + link to the topic's discussion page.
- **Reveal, Reopen, and End all confirm** via the house `.modal` classes
  (each changes what the whole room sees; End is irreversible).

### `/live/play/[code]` — phone view (in-page auth gate)
- **Signed out:** explainer + "Sign in to join" →
  `/auth/login?redirect=/live/play/CODE` (works after §8). 
- **Join gating (review finding):** call `join` only when
  `byCode.status ∈ {lobby, voting}` **and** the caller isn't already a
  participant. For `revealed`/`ended` sessions, render the
  spectator-results / ended view with **no join attempt** (a new user scanning
  the QR after Reveal sees results, not an error; a returning participant
  remounting post-End sees the clean ended state). Treat a `join`
  BAD_REQUEST from a status race as non-fatal (render from `byCode`).
  Note: opening the link while the session is live **is** joining — that's
  intended (residue principle: the roster is the attendance record).
- **Lobby:** "You're in" + topic title + question. **No participant count on
  phones** (review finding: the count isn't readable under participant RLS,
  and the room looks at the projector anyway — cut, not worked around).
- **Voting:** question, option buttons (tap = select), optional note field
  (140-char counter), Submit → `vote`; after submit, selected option shown
  with "Change vote" enabled until reveal. Buttons disabled with
  `mutation.isPending` (house pattern).
- **Revealed:** result bars (same `TallyBars`), own choice highlighted (if
  they voted). If the host reopens voting, the UPDATE nudge flips the phone
  back to the voting UI automatically.
- **Ended:** "Session ended" + `.btn` link to `/topics/[slug]/discuss` —
  the bridge from live room to async discussion.

### `middleware.ts`
Add `/live/new` and `/live/host` to the auth-gated clause. **Preserve the
query string** (review finding — the existing pattern sets
`redirect = pathname` only, which would strip `?topic={slug}` from
`/live/new`):

```ts
loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
```

`/live` and `/live/play/*` stay public (in-page gate so the explainer renders
before login).

---

## 8. Auth redirect fixes (required; one task, several holes)

The QR deep-link flow routes real traffic through `?redirect=` for the first
time, and review found four distinct holes. All are in scope:

1. **Server-side open redirect in `/auth/callback` (security, exists today):**
   `route.ts` does `NextResponse.redirect(\`${origin}${redirect}\`)` with the
   raw param — `?redirect=@evil.com` and `?redirect=.evil.com` both produce
   cross-origin redirects, and the route is reachable without a code param.
   **Fix here, server-side** (not only in the pages): accept only values that
   start with `/`, do not start with `//`, and contain no `\`; else fall back
   to `/topics`.
2. **Login/signup pages drop the param:** read `redirect` via
   `useSearchParams()` (inside `<Suspense>` — see §7 build gotcha), validate
   with the same rule, use it for the post-password-login push, and append it
   **URL-encoded** to the OAuth `redirectTo` / signup `emailRedirectTo`
   callback URLs.
3. **Login ↔ signup cross-links drop the param:** both pages hardcode
   `/auth/signup` and `/auth/login` hrefs — forward `?redirect=` across them
   (a QR scanner who lands on login and taps "Sign up" must not lose the
   destination).
4. **Dashboard config, day 1 of the task:** the callback URL *with query
   param* must match the Supabase auth redirect allow-list, or OAuth silently
   falls back to the Site URL. Verify on staging with both providers; if the
   provider strips query params, fall back to stashing the redirect in
   `sessionStorage` before `signInWithOAuth`.

**Known limitation (document, don't fix):** email-confirmation signup uses
PKCE — the confirmation link only completes in the browser that initiated
signup. Scan-then-confirm-on-laptop dead-ends. OAuth (the §12 script's path)
is unaffected. Acceptable for Sprint 1; revisit with anonymous join.

---

## 9. Security checklist (verify before merge)

- [ ] **Every RLS policy subquery qualifies outer-table columns** with the
      policy's table name (see §4 warning — an unqualified correlation here
      silently becomes a tautology).
- [ ] Non-participant cannot INSERT into `live_responses` — test from an
      account that joined a *different* session (this is the tautology
      regression test).
- [ ] Vote with an option_id from another session rejected **by RLS**
      (direct PostgREST, not just tRPC).
- [ ] Participant cannot vote when status ≠ 'voting' (INSERT and UPDATE paths).
- [ ] Participant cannot read another user's response row (host can).
- [ ] **Signed-in non-member cannot read any `live_sessions` /
      `live_session_options` row** (code enumeration test: `SELECT code FROM
      live_sessions` via PostgREST must return zero rows).
- [ ] `live.create` succeeds end-to-end — `.insert().select()` returns the row
      (the RETURNING-vs-SELECT-policy regression test; §4 warning).
- [ ] Host cannot UPDATE `question`/`code`/`topic_id`/`host_id` via PostgREST
      (column grant), and cannot INSERT a session with status ≠ 'lobby' or a
      topic invisible to them.
- [ ] `get_live_session_by_code` rate limit trips at >30 lookups/min/user.
- [ ] `join_live_session`: no-op success for existing participants at any
      status; rejects *new* joins when revealed/ended; display_name comes from
      `users`, not the client.
- [ ] Non-host cannot `setStatus` (tRPC FORBIDDEN) nor UPDATE `live_sessions`
      via PostgREST (RLS); host *can not* perform an illegal transition via
      PostgREST (trigger raises).
- [ ] Host cannot modify/delete options once status ≠ 'lobby' (policy), and an
      option with votes cannot be deleted (RESTRICT FK).
- [ ] `get_live_tally` raises for a participant while status='voting' (host
      succeeds; FORBIDDEN ≠ empty tally).
- [ ] All new functions: `SECURITY DEFINER SET search_path = ''`,
      fully-qualified refs, EXECUTE revoked from public/anon.
- [ ] `redirect` param sanitized on login/signup **and server-side in
      `/auth/callback`** (`/`-prefixed, not `//`, no `\`).
- [ ] Vote rows with `round_number ≠ 1` rejected by RLS (direct PostgREST —
      the round-stuffing regression test).
- [ ] Note length enforced in zod (≤140) and DB CHECK.
- [ ] Codes exclude ambiguous chars; collision retry works (force-test with a
      stubbed generator).
- [ ] No service-role key anywhere in this feature (user-scoped + SECURITY
      DEFINER RPCs only).

Verification: run the RLS cases as SQL in the Supabase SQL editor with
role/JWT impersonation (`set role authenticated; set request.jwt.claims =
'{"sub":"<uuid>"}'`), or via two browser profiles + devtools. Record results
in the PR description (no test framework exists in this repo; do not introduce
one in this sprint).

---

## 10. Scale posture (review-corrected numbers)

Per current Supabase docs (verified during review):

- **postgres_changes authorization is per-change × per-subscriber and
  single-threaded** — one INSERT on a table with N subscribers triggers N
  serialized RLS reads. Filters do *not* reduce this. Our design keeps phones
  off the high-volume tables (only the host subscribes to votes/joins), so the
  per-change cost on `live_responses` is ~1 subscriber regardless of room
  size. Status UPDATEs fan out to all phones but happen only a few times per
  session.
- **Quotas:** Free tier defaults to 200 concurrent realtime connections and
  **100 messages/sec**; Pro is 500/500; Pro without spend cap 10,000/2,500.
  A reveal with 150 phones is a ~150-message burst — **over the Free-tier
  msgs/sec quota**, and the documented failure mode is client disconnection
  (the polling fallback + auto-reconnect recovers, but "~2 s" becomes
  ~5–10 s at the worst moment). **Run seminars on the Pro plan.**
- **The 900-person banquet** exceeds even Pro's default 500 connections: it
  needs Pro without spend cap (or a support-raised limit), and at that scale
  the right architecture is Broadcast-from-database re-streaming rather than
  900 postgres_changes subscribers — a deliberate Sprint-1 non-goal. Flag plan
  sizing and that design change before committing to any 500+ event.
- Polling fallback (5 s) bounds worst-case staleness on flaky venue Wi-Fi.

---

## 11. Task breakdown (1 engineer; **8–10 working days**)

| # | Task | Est. | Depends on |
|---|---|---|---|
| 1 | Migration 005 (5 tables, 2 helper predicates, 3 RPCs, transition trigger, publication) + `src/types/database.ts` mirror (+ header comment fix) | 1.5 d | — |
| 2 | `liveRouter` (7 procedures incl. RPC error mapping) + root.ts registration | 1 d | 1 |
| 3 | Auth redirect fixes ×4 (§8) + middleware clauses (query-string-preserving) + Suspense wrappers | 1 d | — |
| 4 | `/live` (code entry + mySessions list) + `/live/new` (option editor, Suspense) | 1.5 d | 2 |
| 5 | `/live/host/[code]` (QR, confirm modals, TallyBars, host channel hook, non-host redirect) | 1.5 d | 2 |
| 6 | `/live/play/[code]` (join gating, vote/reveal/spectator/ended states, play channel hook) | 1.5 d | 2 |
| 7 | Topic-page entry button + globals.css `/* ===== Live ===== */` block | 0.5 d | 4–6 |
| 8 | Staging/dashboard config: publication operations check (§4), OAuth redirect allow-list with query param (§8.4), Pro-plan/limits sanity (§10) | 0.5 d | 1, 3 |
| 9 | Security checklist pass (§9, 16 items via SQL impersonation) + two-device acceptance script (§12) | 1 d | all |

**Before writing any Next-specific code:** read the relevant guides in
`node_modules/next/dist/docs/` — this repo pins Next 16.2.2 and AGENTS.md
warns its APIs differ from prior knowledge (the `useSearchParams`/Suspense
build failure in §7 is exactly this class of issue; middleware→proxy naming —
this repo still uses `src/middleware.ts`, keep it).

---

## 12. Manual acceptance script (the exit criterion, verbatim)

Devices: laptop (host), phone A (logged-in user), phone B (fresh user —
exercises signup-via-QR), one phone on cellular if possible.

1. Laptop: topic page → "Host live session" → adjust options → create. Host
   screen shows QR + code + count 0.
2. Phone A: scan QR → play page → already signed in → auto-joins → **host
   screen** count ticks to 1 within 2 s (phones don't show a count — by
   design, §7).
3. Phone B: scan QR → "Sign in to join" → Google OAuth → returns to the
   **play page** (NOT /topics) → joins → host count 2.
4. Laptop: Open voting. Both phones flip to the vote UI without manual refresh.
5. Phones vote (one adds a 140-char note). Host bars update within ~2 s.
6. Phone A changes vote. Host bars shift accordingly.
7. Lock phone A 30 s; unlock → state matches (vote retained, still voting).
8. Laptop: **Reveal** (confirm modal). Both phones show result bars matching
   the host, zero-vote options included. Phone B: attempt a vote via
   devtools/PostgREST → rejected by RLS ("Voting is closed").
9. Laptop: **Reopen voting** (confirm modal). Phones flip back to voting UI;
   change a vote; **Reveal** again — bars update.
10. Laptop: End session (confirm modal). Phones show ended state with
    discuss-page link.
11. Phone A: revisit `/live/play/CODE` → clean ended state, **no join attempt,
    no error** (§7 join gating).
12. Fresh signed-in account (not a participant): open `/live/play/CODE` while
    a *second* session is revealed → sees spectator results; PostgREST
    `SELECT code FROM live_sessions` returns zero rows (D6 spot-check).
13. Laptop: kill network 10 s during voting → host recovers via polling
    fallback; check ws frames for exactly one live subscription after
    recovery (the per-mount-topic rule guards the StrictMode/remount race —
    §6; realtime-js handles reconnect itself).

---

## 13. Open product questions (defaults chosen; flag to change)

1. **Who can host?** Default: any signed-in user (D7). Alternative: gate to
   editors until abuse posture is clearer.
2. **Open-link-equals-join:** scanning the QR while a session is live enrolls
   you on the roster (attendance = residue). Acceptable? (Spectator mode
   without joining exists only post-reveal.)
3. **Notes at reveal:** Sprint 1 never shows notes to the room. Sprint 2's
   spotlight will surface a *drawn* participant's note with their consent
   ("share or pass").

---

## 14. What Sprint 2 inherits

The spotlight draw needs: participant roster (✓ `live_participants` with
server-snapshotted names), responses with notes (✓ host-readable), a place to
run the draw (✓ host screen phase model), and a per-phone "you're up" signal —
the only new primitive, which will reuse the same nudge pattern (a
`spotlight_user_id` column on the session row rides the existing UPDATE
subscription for free; decide then). Multi-round voting needs only code
changes (PK already includes `round_number`). Nothing in this sprint's schema
blocks either.

---

## 15. Implementation notes (v1.3 — what shipped vs. the v1.2 contract)

Accepted deviations, each deliberate:

1. **QR colors:** fixed white card with black QR (`#fff`/`#111`) instead of
   CSS-var theming — react-qr-code sets SVG fill *attributes*, which don't
   support `var()`, and a white quiet zone is what phone scanners want in
   dark venues. The card is the QR's quiet zone in both themes.
2. **"Host live session" button** on the topic page renders for signed-out
   visitors too (middleware bounces to login preserving `?topic=`); treated
   as a funnel, not a leak.
3. **Lobby gets a "Cancel session" button** (lobby→ended was legal in the
   schema but unreachable in the v1.2 UI — an abandoned lobby stayed joinable
   forever).
4. **`setStatus` treats same-status as no-op success** (mirrors the DB
   trigger) so a second host tab that's ≤5s stale resyncs instead of erroring.
5. **Member polling extends to `revealed`** (not just lobby/voting) — the UI
   says "the host may reopen voting", so phones must survive a dead websocket
   at reveal. Non-member spectators slow-poll `byCode` at 10s for the same
   reason (6/min, well under the 30/min limit).
6. **Host realtime channel stays up through `revealed`** so the documented
   reveal-race straggler vote self-heals the tally (D5).
7. **Host poll includes the tally** — during voting the tally IS the
   projector; polling only the session row would freeze the bars on
   websocket-hostile venue networks.
8. **Join failures are recoverable:** the play page shows the error with a
   "Try again" button (a silent strand was the worst reviewer finding), and
   `join_live_session` raises a distinct `profile_missing` (vs `not_found`)
   when the signup trigger failed to create the users row.
9. **`/live/new` has a topic-picker fallback** when `?topic=` is absent.
10. **Code format constants** live in `src/lib/liveCode.ts`, shared by the
    router and the join page; the SQL CHECK is a documented copy.
11. **RLS test harness** checked in at
    `supabase/tests/005_live_sessions_rls_test.sql` (local-only; never run
    against a real project). All §9 checks pass on PG 16.11, including the
    strong-form tautology and cross-session-option regressions.

Deferred follow-ups (not Sprint 1): rename `src/middleware.ts` → `proxy.ts`
per Next 16 naming; snake_case write-path input keys in the live router.
