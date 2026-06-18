# Sprint 3 — Live Quiz + Reactions

Status: **IMPLEMENTED 2026-06-12.** Migration `007_live_quiz.sql` verified on PG16
(`supabase/tests/007_live_quiz_rls_test.sql`, 25/25 assertions pass).

## Goal
A live quiz inside a session: the host pushes `quiz_questions` to phones one at a time, the room
answers, sees a live distribution + correct answer + a running **speed-weighted** leaderboard, plus
ephemeral **reactions** ("applause"). Quiz results persist for the Sprint 4 transcript.

## Key decisions
- **Orthogonal to the state machine** (like the spotlight): no new status; the quiz rides the
  `voting`/`revealed` window.
- **Phones never watch the high-volume answers table.** A draw/push/reveal re-touches
  `live_sessions` (the pointer + `updated_at`), nudging phones via the existing `usePlaySessionChannel`.
  Phones read the denormalized `answer_count` off the round (polled). **Only the host** subscribes to
  `live_quiz_answers` (`useQuizAnswersChannel`).
- **Question content is snapshotted** onto the round (`live_quiz_rounds`), so the room/leaderboard
  render without re-reading the admin-editable `quiz_questions`, and a concurrent admin edit can't
  change a graded round.
- **`correct_answer` is withheld in the RPC projection** until the round is `revealed` (the phone
  path goes only through `get_current_quiz_round`, never a raw rounds SELECT).
- **Speed-weighted scoring** (Morris's call): correct answers earn `500 + floor(500·(1 − elapsed/window))`
  ∈ [500,1000]; wrong = 0. Computed at reveal from the **server-set** `created_at` (timing can't be
  forged). **First answer wins** (lock-in).
- **Leaderboard** is room-visible (named) by default, with a per-session host toggle
  (`quiz_leaderboard_public`).
- **Reactions** are an ephemeral Supabase **broadcast** channel — no table, no migration, no
  `postgres_changes`. Fixed presets (👏 😂 🤯 ❤️), client-throttled ≤1/500ms, never persisted (so they
  don't feed the transcript).

## Data model (`007_live_quiz.sql`)
- `live_sessions` += `current_quiz_round_id` (RPC-only nudge pointer), `quiz_leaderboard_public` (host-granted).
- `live_quiz_rounds` (LOW volume): snapshot of question + `status` (asking→revealed), `answer_window_sec`,
  `answer_count`, sequence. Member-read RLS; `REVOKE UPDATE` (definer-only); transition trigger.
- `live_quiz_answers` (HIGH volume): PK(session,round,user), `answer`, `is_correct` (null till reveal),
  `score`, server-set `created_at`. Own-row + host SELECT; no INSERT/UPDATE policy (RPC-only).
- 6 SECURITY DEFINER RPCs: `push_live_quiz_round`, `get_current_quiz_round`, `submit_live_quiz_answer`,
  `reveal_live_quiz_round`, `get_live_quiz_aggregate`, `get_live_quiz_leaderboard`.
- Publication: only `live_quiz_answers` added (host channel); rounds ride the pointer.

## tRPC + UI
- `liveRouter`: `pushQuizQuestion`, `currentQuizRound`, `submitQuizAnswer`, `revealQuizRound`,
  `quizAggregate`, `quizLeaderboard`, `setQuizLeaderboardPublic`. Host picker reuses `quiz.byTopic`.
- New hooks: `useQuizAnswersChannel` (host-only), `useReactionsChannel` (broadcast).
- Components: `QuizQuestionCard`, `QuizLeaderboard`, `QuizPushPicker`, `ReactionBar`, `ReactionBurstLayer`.
- Host: a Quiz block in voting/revealed (picker → push → answer-count → Reveal → distribution +
  leaderboard + room-visibility toggle). Phone: answer UI + reaction bar; the distribution reuses `TallyBars`.

## Security checklist (PG16, all pass)
non-host can't push/reveal; topic-mismatch rejected; `correct_answer` withheld pre-reveal (host sees it);
answer lock-in + `answer_count`; non-member can't submit/read; aggregate forbidden pre-reveal;
speed score in [500,1000] correct / 0 wrong; post-reveal room reads aggregate (0-count choices present);
leaderboard host/public gates; column pins (pointer + answer score → 42501); revealed is terminal;
results survive `ended`; anon locked out.

## Before live
Apply `007_live_quiz.sql` (after 006). Confirm `live_quiz_answers` is in `supabase_realtime`.
Deploy code only after the migration. The async comprehension quiz (`quiz_questions`, `ai.submitQuiz`)
is unchanged — the live quiz reuses the table read-only.
