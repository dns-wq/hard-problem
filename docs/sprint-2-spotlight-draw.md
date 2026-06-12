# Sprint 2 — Spotlight Draw (the tender raffle, re-skinned as "call on a participant")

Status: **IMPLEMENTED 2026-06-12** (pending migration apply + acceptance test on a 006 DB).
Builds on Sprint 1 ([sprint-1-live-sessions.md](sprint-1-live-sessions.md)). Migration `006_spotlight_draw.sql`
verified on local PG16 (27/27 security + logic tests pass, `supabase/tests/006_spotlight_draw_rls_test.sql`).

## 1. Goal

During or after a live session, the **host draws a present participant to "call on"** — inviting
them to reason aloud. The same engine degrades to a **pure prize raffle (摸彩)** for the Taoyuan
Airport tender via a single create-time flag. Weighted modes (incl. "minority steelman"); **pass is
always allowed**; the draw feels fair and exciting on the projector and lands on the drawn person's
phone ("it's you").

## 2. Scope

### In scope
- A host-only, server-authoritative weighted draw with four modes (uniform / no-repeat /
  minority-weighted / minority-steelman).
- Pass (the drawn participant declines) → host re-draws.
- Share aloud, optionally projecting the drawn person's 140-char note (their choice).
- Consent: an "open to being called on" opt-out toggle (default on).
- A projector drawing animation + phone "it's you" callout + host "already-called" roster.
- Raffle mode: a dedicated framing-free create branch on `/live/new`.

### Out of scope (deferred)
- Heartbeat / presence (a participant who closed their tab is still "present" — Pass + Clear cover it).
- Per-voting-round draw cycles (no-repeat persists for the whole session; `round_number` stays pinned to 1).
- Anonymous join (still authenticated-only — the `handle_new_user` constraint from Sprint 1).
- Weighted raffle / prize tiers, draw-history export (Sprint 5).

## 3. Key design decisions

- **D1. Drawing is orthogonal to the vote machine.** No new session status; the
  `lobby→voting⇄revealed→ended` trigger is untouched. A session can be `voting` *and* have a live
  spotlight at once (minority-steelman wants both). Adding a `drawing` status would have rippled
  into the trigger, the CHECK, the `TRANSITIONS` map, the `setStatus` enum, and every
  status-string polling/channel guard.
- **D2. One low-volume table + a pointer nudge.** `live_spotlight_draws` (one row per draw) is the
  source of truth, history, and no-repeat ledger. `live_sessions.current_spotlight_draw_id` is the
  realtime nudge — phones already watch the session row, so the spotlight adds **zero new phone
  subscriptions** (honours Sprint 1 D3 "phones never watch high-volume tables").
- **D3. The host cannot rig the draw.** Randomness lives only inside `draw_spotlight()`
  (SECURITY DEFINER). The host passes a *mode*, never a winner. `drawn_user_id` is **physically
  immutable** post-insert (REVOKE UPDATE + narrow GRANT — the Sprint 1 column-pin trick). The
  pointer + cycle columns are written **only** by the definer RPCs, not in the `authenticated`
  grant — so a host cannot re-point or invent a winner via PostgREST either (the tightened
  anti-rig posture, open decision #7).
- **D4. Fair weighting in one SQL pass.** A-Res weighted reservoir: `power(random(), 1/w)`, pick
  the max → selection probability exactly ∝ `w`. (A naïve `ORDER BY random()*w` is *not*
  proportional.)
- **D5. Pass is the participant's act alone.** A plain RLS-gated self-UPDATE on their own draw row,
  **not** a host RPC — the consent safety-valve can't be bypassed by the host.
- **D6. The note is never auto-projected.** The projector shows only the drawn name; the note
  reaches the screen only if the drawn person ticks "show my note on screen" (`note_shared`). Their
  own phone always recalls it locally so they can read it aloud. Mirrors Sprint 1 D5 ("the room
  sees aggregates, never rows").
- **D7. A pass is never surfaced by name.** The room sees a neutral "Passed — draw again", never the
  decliner's name (so using Pass carries no social cost). History is host-only either way.

## 4. Data model — `supabase/migrations/006_spotlight_draw.sql`

**`live_sessions`** gains three columns (orthogonal to `status`):
`raffle_mode BOOLEAN NOT NULL DEFAULT false` (create-time only, not granted → immutable);
`current_spotlight_draw_id UUID` (the nudge pointer; FK → `live_spotlight_draws` ON DELETE SET NULL);
`spotlight_cycle INTEGER NOT NULL DEFAULT 0` (no-repeat cycle counter, bumped by the RPC on exhaustion).

**`live_participants`** gains `callable BOOLEAN NOT NULL DEFAULT true` (consent opt-out, snapshotted at join).

**`live_spotlight_draws`** (new, low-volume): `id, session_id, cycle, sequence, mode,
minority_option_id, drawn_user_id, display_name, pool_size, outcome (pending|shared|passed|cleared),
note_shared, created_at, resolved_at`, `UNIQUE (session_id, sequence)`.

### RLS
- SELECT `drawn_user_id = auth.uid() OR is_live_session_host(session_id)` — a participant reads only
  draws naming them; the host reads all. The public spotlight name reaches the room only through
  `get_current_spotlight()` (definer), never a direct SELECT.
- No INSERT policy (draws are made only by `draw_spotlight()`).
- UPDATE `drawn_user_id = auth.uid() AND (current spotlight) = this row`, WITH CHECK
  `outcome IN ('shared','passed')`. **Outer columns qualified** (`live_spotlight_draws.session_id`)
  — the tautology guard.
- Column pin: `REVOKE UPDATE … ; GRANT UPDATE (outcome, note_shared, resolved_at)`. Everything else
  is immutable to non-definer callers.
- `live_participants`: `GRANT UPDATE (callable)` + a self-row consent policy; `display_name` stays
  server-only.

### Trigger
`enforce_live_spotlight_transition()` BEFORE UPDATE OF outcome: `pending → {shared,passed,cleared}`;
those three are terminal.

### RPCs (all SECURITY DEFINER, `SET search_path=''`, `auth.uid()` guard, bare-token RAISEs)
- `draw_spotlight(p_session_id, p_mode, p_exclude_user_id=NULL)` → `(draw_id, drawn_display_name,
  mode, sequence, pool_size)`. Host-only; status must be voting|revealed; A-Res weighting; cycle
  reset on no-repeat exhaustion; inserts the draw + flips the pointer in one transaction. Tokens:
  `forbidden, not_found, session_closed, no_minority, no_minority_voters, no_eligible_participants,
  bad_mode`.
- `get_current_spotlight(p_session_id)` → the active spotlight (or empty). Membership-gated; `is_you`
  server-side; `drawn_note` only to the drawn user or once `note_shared`.
- `clear_spotlight(p_session_id)` — host-only; pending → cleared (does not consume the no-repeat pool)
  + null the pointer.
- `get_spotlight_history(p_session_id)` — host-only roster (LEFT JOIN so never-drawn participants
  appear with `draw_count 0`).
- `join_live_session(p_session_id, p_callable=true)` — **replaces** the Sprint 1 single-arg form
  (DROP + recreate to avoid overload ambiguity) so join can snapshot consent.

### Realtime publication
The phone path needs no new publication — the nudge rides the existing `live_sessions` UPDATE. Only
`live_spotlight_draws` is added (idempotent DO-block), for the **host-only** history channel.

## 5. tRPC — `liveRouter` additions (`src/lib/trpc/routers/live.ts`)

`draw`, `currentSpotlight`, `passDraw`, `shareDraw`, `clearDraw`, `drawHistory`, `setCallable`;
`create` extended (`raffleMode` + `options.min(0)` with a ≥2 guard for non-raffle); `join` extended
(`callable`); `bySessionId` returns `myCallable`. Error mapping reuses `rpcErrorIncludes` + the
Sprint 1 table. **`no_minority_voters` is matched before `no_minority`** (substring). `passDraw`/
`shareDraw` are direct RLS-gated UPDATEs that detect 0 rows ("no longer active") and map 42501.

## 6. Realtime hooks — `src/components/live/useLiveChannels.ts`

New `useSpotlightDrawsChannel(sessionId, enabled, onActivity)` — **host-only**, watches
`live_spotlight_draws` INSERT/UPDATE (throttled, per-mount topic, 3s retry). It brings pass/share/
note changes (which don't move the pointer) to the projector instantly. The phone path reuses the
unchanged `usePlaySessionChannel` (the draw flips the pointer it already watches).

## 7. Routes & UI

- **`SpotlightStage`** (host): cycling-names raffle animation → lands on the server's winner; neutral
  "Passed — draw again" for a pass; odds readout (`drawn from N eligible`); the shared note as a
  projector blockquote only when `note_shared`.
- **`SpotlightCallout`** (drawn phone): "It's you" / "You won! 🎉", local note recall, Share/Pass,
  and a "show my note on screen" toggle.
- **`SpotlightOtherView`** (other phones): slim banner; nothing for a pass.
- **`SpotlightHistory`** (host): "called on · K of N" chips.
- **Host page**: a mode `<select>` (hidden in raffle) + Draw/Re-draw/Clear; polls
  currentSpotlight + drawHistory in **voting AND revealed**.
- **Play page**: spotlight UI above the vote/result content (gated on `spotlightActive` so it
  vanishes the instant the session ends); the consent toggle appears in the lobby **and** the voting
  view (an ongoing opt-out, hidden in raffle); the callout is keyed by `draw_id` so its
  "show my note" choice resets every draw; polls currentSpotlight in voting AND revealed.
- **`/live/new`**: a "Raffle mode (摸彩)" toggle that hides the question/options and creates a
  raffle session.

## 8. Weighting math (in `draw_spotlight`)

Pool `P` = `live_participants` for the session (no heartbeat — "present" == "joined"). Named modes
restrict `P` to `callable = true` (raffle_mode ignores it). Key = `power(random(), 1/w)`, pick MAX.
- **uniform** — `w=1`, repeats allowed. The pure raffle.
- **no_repeat** — `w=1`, exclude anyone drawn this cycle with outcome ∈ {pending,shared,passed}
  (cleared = a mulligan, doesn't count). Pool empty → bump `spotlight_cycle`, re-pool once.
- **minority_weighted** — `w=3` for voters of the minority option (smallest strictly-positive count,
  ties → lowest display_order), else 1. (8 majority + 2 minority ⇒ a minority voter 21.4% vs 7.1%.)
- **minority_steelman** — pool restricted to minority voters, `w=1` within.

Degenerate pools raise distinct tokens (never collapsed): `no_eligible_participants`,
`no_minority_voters` (steelman pool empty), `no_minority` (zero votes), surfaced as friendly
BAD_REQUEST copy.

## 9. Consent & privacy

Two exposures, two layers. **Name**: `callable` opt-out (default on) gates the named-mode pool; the
in-the-moment Pass is the second layer. **Note**: never auto-projected — only the drawn person can
flip `note_shared`, on their own row, via the column grant. `is_you` and the note gate are computed
inside `get_current_spotlight` so a phone can neither spoof "it's me" nor read a private note. A pass
is never surfaced by name (D7) — `get_current_spotlight` blanks `drawn_display_name` for
passed/cleared draws to everyone but the drawn user (server-enforced, not just client-hidden).

## 10. Raffle degradation (tender 摸彩)

`raffle_mode = true` ⇒ the same engine with: uniform-only (mode picker hidden), `callable` ignored
(door-prize implicit consent), no vote options / tally / Reveal, and copy swaps
(`LUCKY DRAW · 摸彩`, "You won! 🎉"). The carrier topic stays host-side only — the audience-facing
projector shows no philosophy framing.

## 11. Security checklist — verified on PG16

`supabase/tests/006_spotlight_draw_rls_test.sql` (27 assertions, all PASS): non-host draw forbidden;
consent excludes opted-out from the pool; pointer/draw row created; `is_you` + note gating;
**column-pin** (host cannot rewrite `drawn_user_id` / pointer / cycle / raffle_mode → 42501);
pass only by the drawn user; outcome terminality (trigger); self-clear blocked (WITH CHECK);
host-only clear; steelman draws a minority voter; `no_minority` on a vote-less session; no-repeat
cycle exhaustion + reset; cross-session isolation (non-member sees zero draws, current-spotlight
forbidden); host-only history; draw rejected on an ended session; anon locked out of every RPC.

## 12. Manual acceptance script (exit criterion — run on a 006 DB, two devices)

1. Host creates a session, opens voting, two phones join + vote (one minority).
2. Host draws **uniform** → projector cycles names + lands; the drawn phone shows "It's you" + its
   own note; the other phone shows "X was called on".
3. Drawn phone **passes** → projector shows neutral "Passed — draw again" (no name); host draws again,
   never re-lands on the passer (no-repeat modes) .
4. Draw **minority_steelman** → lands on a minority voter; they tick "show my note" + Share → the note
   appears on the projector and the other phone.
5. Toggle a phone's consent **off** in the lobby → it is never drawn in named modes.
6. Create a **raffle** session (`/live/new` → Raffle mode) → no question/options; Draw a winner →
   "You won! 🎉"; no philosophy framing on the projector.
7. Kill the host websocket (offline 6s) → the projector still updates within 5s (polling fallback).

## 13. Open product decisions (all resolved 2026-06-12)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Consent toggle default | **opt-out** (callable default true) |
| 2 | Minority favor factor | **3×** (tunable constant) |
| 3 | Note on projector | **explicit "show my note" only** |
| 4 | What the room sees on a pass | **silent** (no name) |
| 5 | Raffle creation flow | **dedicated `/live/new` branch** |
| 6 | No-repeat scope | **persist whole session** |
| 7 | Anti-rig residual | **tightened** (pointer/cycle RPC-only) |

## 14. Before this goes live (Morris)

- **Apply `006_spotlight_draw.sql`** in the Supabase SQL editor — and deploy the Sprint 2 code only
  *after* (the code reads `live_participants.callable` etc., so an older DB would error). Same
  coupling as Sprint 1.
- Confirm `live_spotlight_draws` is in `supabase_realtime` with `pubinsert`/`pubupdate` (the
  migration's DO-block adds it; the host history channel relies on it).
- Run §12 on two devices as the exit criterion.

## 15. Deviations & risks

- **"Present" == "joined"** (no heartbeat): a closed-tab participant can be drawn and stall; Pass +
  Re-draw + Clear cover it. A large room may see a few dead draws — flag if the tender room is big.
- **Uniform re-draw after a pass** can re-pick the passer (uniform tracks no no-repeat); low
  probability, they can pass again. No-repeat/minority modes exclude the passer automatically.
- **Fairness is provable but not visible**: the projector shows the odds (`N eligible`, `3×`) to
  build trust; the real guarantee is the column-pin + server-side `random()`.
- **Deploy ordering** is load-bearing (see §14).
- **OAuth gate for the raffle**: tender walk-up guests still authenticate (anonymous breaks
  `handle_new_user`) — confirm the tender accepts this.
