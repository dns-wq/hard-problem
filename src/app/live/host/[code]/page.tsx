"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import { trpc } from "@/lib/trpc/client";
import {
  usePlaySessionChannel,
  useHostSessionChannel,
  useSpotlightDrawsChannel,
  useQuizAnswersChannel,
  useReactionsChannel,
} from "@/components/live/useLiveChannels";
import TallyBars from "@/components/live/TallyBars";
import ConfirmModal from "@/components/live/ConfirmModal";
import SpotlightStage from "@/components/live/SpotlightStage";
import SpotlightHistory from "@/components/live/SpotlightHistory";
import QuizPushPicker from "@/components/live/QuizPushPicker";
import QuizLeaderboard from "@/components/live/QuizLeaderboard";
import ReactionBurstLayer, { type ReactionBurst } from "@/components/live/ReactionBurstLayer";
import type { SpotlightMode, ReactionKind } from "@/types/database";

type HostAction = "revealed" | "voting" | "ended";

const CONFIRMS: Record<HostAction, { title: string; body: string; confirmLabel: string }> = {
  revealed: {
    title: "Reveal results?",
    body: "Voting closes and every phone in the room will see the result bars. You can reopen voting afterwards if needed.",
    confirmLabel: "Reveal results",
  },
  voting: {
    title: "Reopen voting?",
    body: "The results leave every screen and the room can vote (or change votes) again.",
    confirmLabel: "Reopen voting",
  },
  ended: {
    title: "End this session?",
    body: "This is final — the room sees a session-ended screen with a link to the topic discussion.",
    confirmLabel: "End session",
  },
};

export default function HostSessionPage() {
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<HostAction | null>(null);
  const [actionError, setActionError] = useState("");
  const [origin, setOrigin] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedMode, setSelectedMode] = useState<SpotlightMode>("uniform");
  const [drawError, setDrawError] = useState("");
  const [quizError, setQuizError] = useState("");
  const [bursts, setBursts] = useState<ReactionBurst[]>([]);
  const burstSeq = useRef(0);

  useEffect(() => setOrigin(window.location.origin), []);

  const byCode = trpc.live.byCode.useQuery({ code }, { retry: false });
  const preview = byCode.data;

  // Non-hosts get the phone view — a non-host "mirror" would be blind during
  // lobby/voting (tally and roster are host-gated by design)
  useEffect(() => {
    if (preview && !preview.is_host) {
      router.replace(`/live/play/${code}`);
    }
  }, [preview, code, router]);

  const isHost = !!preview?.is_host;
  const sessionQuery = trpc.live.bySessionId.useQuery(
    { sessionId: preview?.id ?? "" },
    { enabled: !!preview?.id && isHost },
  );
  const session = sessionQuery.data?.session;
  const status = session?.status ?? preview?.status;

  const tallyQuery = trpc.live.tally.useQuery(
    { sessionId: preview?.id ?? "" },
    { enabled: !!preview?.id && isHost && status !== "lobby" },
  );

  // Spotlight can be drawn while voting AND revealed (orthogonal to the machine)
  const spotlightActive = status === "voting" || status === "revealed";
  const currentSpotlightQuery = trpc.live.currentSpotlight.useQuery(
    { sessionId: preview?.id ?? "" },
    { enabled: !!preview?.id && isHost && spotlightActive },
  );
  const drawHistoryQuery = trpc.live.drawHistory.useQuery(
    { sessionId: preview?.id ?? "" },
    { enabled: !!preview?.id && isHost && spotlightActive },
  );

  // Quiz (orthogonal — same voting/revealed window as the spotlight)
  const quizQuestionsQuery = trpc.quiz.byTopic.useQuery(
    { topicId: preview?.topic_id ?? "" },
    { enabled: !!preview?.topic_id && isHost && spotlightActive },
  );
  const currentQuizRoundQuery = trpc.live.currentQuizRound.useQuery(
    { sessionId: preview?.id ?? "" },
    { enabled: !!preview?.id && isHost && spotlightActive },
  );
  const quizRound = currentQuizRoundQuery.data ?? null;
  const quizAggregateQuery = trpc.live.quizAggregate.useQuery(
    { roundId: quizRound?.round_id ?? "" },
    { enabled: !!quizRound?.round_id && isHost },
  );
  const quizLeaderboardQuery = trpc.live.quizLeaderboard.useQuery(
    { sessionId: preview?.id ?? "" },
    { enabled: !!preview?.id && isHost && spotlightActive },
  );
  const recapQuery = trpc.live.recapSummary.useQuery(
    { sessionId: preview?.id ?? "" },
    { enabled: !!preview?.id && isHost && (status === "ended" || status === "revealed") },
  );

  // Polling fallback while the room is active: a dropped websocket degrades
  // to 5s staleness, not a frozen projector. During voting the tally IS the
  // screen — it must be polled too, not just the session row.
  // Poll until the session ends. The spotlight is drawn in voting AND revealed,
  // so currentSpotlight/history must keep polling there too — not just while
  // lobby/voting. Missing 'revealed' would freeze the projector after a reveal.
  const polling = !!status && status !== "ended";
  useEffect(() => {
    if (!polling || !preview?.id || !isHost) return;
    const interval = setInterval(() => {
      sessionQuery.refetch();
      if (status !== "lobby") tallyQuery.refetch();
      if (spotlightActive) {
        currentSpotlightQuery.refetch();
        drawHistoryQuery.refetch();
        currentQuizRoundQuery.refetch();
        quizAggregateQuery.refetch();
        quizLeaderboardQuery.refetch();
      }
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling, status, spotlightActive, preview?.id, isHost]);

  // Nudges: state transitions ride the session channel; votes/joins ride the
  // host channel (throttled to ≤1 refetch/sec inside the hook). The host
  // channel stays up through "revealed" so a vote in flight at the moment of
  // Reveal still self-heals the tally (D5's documented race).
  usePlaySessionChannel(preview?.id, isHost, () => {
    sessionQuery.refetch();
    tallyQuery.refetch();
    currentSpotlightQuery.refetch(); // a draw flips the session pointer
    drawHistoryQuery.refetch();
    currentQuizRoundQuery.refetch(); // a quiz push / reveal re-touches the pointer
    quizAggregateQuery.refetch();
  });
  useHostSessionChannel(preview?.id, isHost && status !== "ended", () => {
    sessionQuery.refetch();
    if (status !== "lobby") tallyQuery.refetch();
  });
  // Pass / share / note-share don't move the pointer — this host-only channel
  // brings those to the projector instantly (phones never subscribe here).
  useSpotlightDrawsChannel(preview?.id, isHost && spotlightActive, () => {
    currentSpotlightQuery.refetch();
    drawHistoryQuery.refetch();
  });
  // Host-only: quiz answers stream (high volume). Phones never subscribe here.
  useQuizAnswersChannel(preview?.id, isHost && spotlightActive, () => {
    currentQuizRoundQuery.refetch(); // answer_count
    quizAggregateQuery.refetch();
    quizLeaderboardQuery.refetch();
  });
  const addBurst = useCallback((kind: ReactionKind) => {
    const id = `${Date.now()}-${burstSeq.current++}`;
    setBursts((b) => [...b, { id, kind, left: 10 + Math.random() * 80 }]);
    setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 2100);
  }, []);
  useReactionsChannel(preview?.id, isHost && spotlightActive, addBurst);

  const setStatus = trpc.live.setStatus.useMutation({
    onSuccess: () => {
      setPendingAction(null);
      setActionError("");
      sessionQuery.refetch();
      tallyQuery.refetch();
    },
    onError: (e) => {
      // Never fail silently on the projector: show why, and resync (a second
      // host tab may have already moved the state)
      setPendingAction(null);
      setActionError(e.message);
      sessionQuery.refetch();
      tallyQuery.refetch();
    },
  });

  const drawMut = trpc.live.draw.useMutation({
    onSuccess: () => {
      // Let the marquee spin briefly, then reveal the server's chosen winner.
      // (The pointer-flip nudge already refetched the data; this just ends the
      // animation so the landed name shows.)
      setTimeout(() => {
        setIsDrawing(false);
        currentSpotlightQuery.refetch();
        drawHistoryQuery.refetch();
      }, 1600);
    },
    onError: (e) => {
      setIsDrawing(false);
      setDrawError(e.message);
    },
  });

  const clearMut = trpc.live.clearDraw.useMutation({
    onSuccess: () => {
      setDrawError("");
      currentSpotlightQuery.refetch();
      drawHistoryQuery.refetch();
    },
    onError: (e) => setDrawError(e.message),
  });

  const pushQuiz = trpc.live.pushQuizQuestion.useMutation({
    onSuccess: () => {
      setQuizError("");
      currentQuizRoundQuery.refetch();
      quizAggregateQuery.refetch();
    },
    onError: (e) => setQuizError(e.message),
  });
  const revealQuiz = trpc.live.revealQuizRound.useMutation({
    onSuccess: () => {
      setQuizError("");
      currentQuizRoundQuery.refetch();
      quizAggregateQuery.refetch();
      quizLeaderboardQuery.refetch();
    },
    onError: (e) => setQuizError(e.message),
  });
  const setLeaderboardPublic = trpc.live.setQuizLeaderboardPublic.useMutation({
    onSuccess: () => sessionQuery.refetch(),
  });

  if (byCode.isLoading) {
    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </div>
    );
  }

  if (byCode.error || !preview) {
    return (
      <div className="page" style={{ maxWidth: 900, textAlign: "center", paddingTop: "4rem" }}>
        <p style={{ color: "var(--text-muted)" }}>{byCode.error?.message ?? "No session with that code."}</p>
        <Link href="/live" className="btn" style={{ marginTop: "1rem", display: "inline-block", textDecoration: "none" }}>
          ← Live sessions
        </Link>
      </div>
    );
  }

  if (!isHost) return null; // redirecting to the play view

  const participantCount = sessionQuery.data?.participantCount ?? 0;
  const tally = tallyQuery.data;
  const joinUrl = origin ? `${origin}/live/play/${code}` : "";

  const raffle = !!session?.raffle_mode;
  const canDraw = status === "voting" || status === "revealed";
  const spotlight = currentSpotlightQuery.data ?? null;
  const rosterNames = (drawHistoryQuery.data ?? []).map((r) => r.display_name);

  function handleDraw() {
    setDrawError("");
    setIsDrawing(true);
    drawMut.mutate({ sessionId: preview.id, mode: raffle ? "uniform" : selectedMode });
  }

  // Shared draw surface — rendered in both voting and revealed (orthogonal to
  // the vote machine). For a raffle it IS the main content; otherwise it sits
  // below the tally.
  const spotlightBlock = canDraw ? (
    <div style={{ marginTop: "2.5rem", borderTop: "1px solid var(--border-light)", paddingTop: "1.5rem" }}>
      <SpotlightStage spotlight={spotlight} rosterNames={rosterNames} isDrawing={isDrawing} raffleMode={raffle} />
      <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center", alignItems: "center", flexWrap: "wrap", marginTop: "1.25rem" }}>
        {!raffle && (
          <select
            className="form-input"
            style={{ width: "auto" }}
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value as SpotlightMode)}
            disabled={drawMut.isPending || isDrawing}
            aria-label="Draw mode"
          >
            <option value="uniform">Random</option>
            <option value="no_repeat">No repeats</option>
            <option value="minority_weighted">Favor minority (3×)</option>
            <option value="minority_steelman">Minority steelman</option>
          </select>
        )}
        <button type="button" className="btn btn-primary" disabled={drawMut.isPending || isDrawing} onClick={handleDraw}>
          {isDrawing ? "Drawing…" : spotlight ? "Draw again" : raffle ? "Draw a winner" : "Call on someone"}
        </button>
        {spotlight && (
          <button type="button" className="btn" disabled={clearMut.isPending} onClick={() => clearMut.mutate({ sessionId: preview.id })}>
            Clear
          </button>
        )}
      </div>
      {drawError && <p className="auth-error" style={{ textAlign: "center", marginTop: "0.75rem" }}>{drawError}</p>}
      <SpotlightHistory rows={drawHistoryQuery.data ?? []} />
    </div>
  ) : null;

  const quizQuestions = quizQuestionsQuery.data ?? [];
  const quizDist = quizAggregateQuery.data ?? [];
  const quizLeaders = quizLeaderboardQuery.data ?? [];

  const quizBlock = canDraw && !raffle ? (
    <div style={{ marginTop: "2.5rem", borderTop: "1px solid var(--border-light)", paddingTop: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Quiz</h2>
        {quizLeaders.length > 0 && (
          <button
            type="button"
            className="live-chip"
            onClick={() => setLeaderboardPublic.mutate({ sessionId: preview.id, isPublic: !session?.quiz_leaderboard_public })}
          >
            {session?.quiz_leaderboard_public ? "Hide leaderboard from room" : "Show leaderboard to room"}
          </button>
        )}
      </div>

      {quizRound && (
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <p style={{ fontSize: "1.4rem", fontWeight: 700, lineHeight: 1.3 }}>{quizRound.question_text}</p>
          {quizRound.status === "asking" ? (
            <div style={{ marginTop: "1rem" }}>
              <p style={{ fontSize: "1.1rem", color: "var(--text-secondary)" }}>{quizRound.answer_count} answered</p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: "1rem" }}
                disabled={revealQuiz.isPending}
                onClick={() => revealQuiz.mutate({ sessionId: preview.id, roundId: quizRound.round_id })}
              >
                {revealQuiz.isPending ? "Revealing…" : "Reveal answers"}
              </button>
            </div>
          ) : (
            <div style={{ marginTop: "1rem" }}>
              <TallyBars
                options={quizDist.map((d) => ({ optionId: d.answer_label, label: d.answer_label, count: d.vote_count }))}
                total={quizDist.reduce((s, d) => s + d.vote_count, 0)}
                highlightOptionId={quizRound.correct_answer}
                large
              />
              <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginTop: "0.6rem" }}>
                Correct answer: <strong>{quizRound.correct_answer}</strong>
              </p>
            </div>
          )}
        </div>
      )}

      {quizError && <p className="auth-error" style={{ textAlign: "center", marginBottom: "0.75rem" }}>{quizError}</p>}

      <QuizPushPicker
        questions={quizQuestions}
        currentQuestionId={quizRound?.quiz_question_id ?? null}
        busy={pushQuiz.isPending}
        onPush={(id) => pushQuiz.mutate({ sessionId: preview.id, quizQuestionId: id })}
      />

      {quizLeaders.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <h3 style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.6rem" }}>
            Leaderboard{session?.quiz_leaderboard_public ? "" : " (hidden from room)"}
          </h3>
          <QuizLeaderboard rows={quizLeaders} large />
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <ReactionBurstLayer bursts={bursts} />
      {/* Header: topic + question, or neutral raffle framing, distance-readable */}
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
          {raffle ? "LUCKY DRAW · 摸彩" : preview.topic_title}
        </span>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, lineHeight: 1.25, marginTop: "0.5rem" }}>
          {raffle ? "Prize Draw" : session?.question || preview.question}
        </h1>
      </div>

      {status === "lobby" && (
        <div style={{ textAlign: "center" }}>
          {/* White card = QR quiet zone: scanner-reliable in both themes */}
          {joinUrl && (
            <div style={{ display: "inline-block", background: "#ffffff", padding: 20, borderRadius: 16 }}>
              <QRCode value={joinUrl} size={260} bgColor="#ffffff" fgColor="#111111" />
            </div>
          )}
          <div className="live-code" style={{ marginTop: "1.5rem" }}>{code}</div>
          <p style={{ fontSize: "1.1rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
            Scan the code or go to <strong>{origin ? origin.replace(/^https?:\/\//, "") : ""}/live</strong>
          </p>
          <p style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: "1.5rem" }}>
            {participantCount} {participantCount === 1 ? "person" : "people"} in the room
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "1.5rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: "1rem", padding: "0.7rem 2rem" }}
              onClick={() => setStatus.mutate({ sessionId: preview.id, status: "voting" })}
              disabled={setStatus.isPending}
            >
              {setStatus.isPending ? "Opening…" : raffle ? "Start raffle" : "Open voting"}
            </button>
            <button type="button" className="btn" onClick={() => setPendingAction("ended")}>
              Cancel session
            </button>
          </div>

          {session?.published && origin && (
            <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-light)" }}>
              <p style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
                Collecting RSVPs
              </p>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Share this link so people can reserve a spot:</p>
              <code style={{ display: "inline-block", marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--accent)", wordBreak: "break-all" }}>
                {origin}/live/rsvp?code={code}
              </code>
            </div>
          )}
        </div>
      )}

      {status === "voting" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent)" }}>
              {raffle ? "Raffle open" : "Voting open"}
            </span>
            <span style={{ fontSize: "1rem", color: "var(--text-secondary)" }}>
              {raffle ? `${participantCount} in the draw` : `${tally?.total ?? 0} of ${participantCount} voted`} · join code{" "}
              <strong>{code}</strong>
            </span>
          </div>
          {!raffle && <TallyBars options={tally?.options ?? []} total={tally?.total ?? 0} large />}
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: raffle ? "0.5rem" : "2.5rem" }}>
            {!raffle && (
              <button type="button" className="btn btn-primary" onClick={() => setPendingAction("revealed")}>
                Reveal results
              </button>
            )}
            <button type="button" className="btn" onClick={() => setPendingAction("ended")}>
              End session
            </button>
          </div>
        </div>
      )}

      {status === "revealed" && (
        <div>
          <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
              Results · {tally?.total ?? 0} votes from {tally?.participantCount ?? participantCount} participants
            </span>
          </div>
          <TallyBars options={tally?.options ?? []} total={tally?.total ?? 0} large />
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "2.5rem" }}>
            <button type="button" className="btn" onClick={() => setPendingAction("voting")}>
              Reopen voting
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setPendingAction("ended")}>
              End session
            </button>
          </div>
        </div>
      )}

      {spotlightBlock}

      {quizBlock}

      {status === "ended" && (
        <div style={{ textAlign: "center", paddingTop: "1rem" }}>
          <p style={{ fontSize: "1.2rem", color: "var(--text-secondary)" }}>
            Session ended — {tally?.total ?? 0} votes from {tally?.participantCount ?? participantCount} participants.
          </p>
          <div style={{ marginTop: "1.5rem", maxWidth: 640, marginLeft: "auto", marginRight: "auto" }}>
            <TallyBars options={tally?.options ?? []} total={tally?.total ?? 0} />
          </div>

          {recapQuery.data && (
            <div style={{ marginTop: "2rem" }}>
              <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                Session recap
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.6rem", maxWidth: 640, margin: "0 auto" }}>
                {[
                  { label: "Participants", value: recapQuery.data.participant_count },
                  { label: "RSVPs", value: recapQuery.data.rsvp_count },
                  { label: "Votes", value: recapQuery.data.vote_count },
                  { label: "Called on", value: recapQuery.data.spotlight_count },
                  { label: "Quiz answers", value: recapQuery.data.quiz_answers },
                ].map((s) => (
                  <div key={s.label} style={{ padding: "0.85rem", background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: 10 }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--accent)" }}>{s.value}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <a href={`/api/live/${preview.id}/recap`} className="btn" style={{ marginTop: "1.25rem", display: "inline-block", textDecoration: "none" }}>
                Export CSV
              </a>
            </div>
          )}

          <Link
            href={`/topics/${preview.topic_slug}/discuss`}
            className="btn btn-primary"
            style={{ marginTop: "2rem", display: "inline-block", textDecoration: "none" }}
          >
            Continue in the topic discussion →
          </Link>
        </div>
      )}

      {actionError && (
        <p className="auth-error" style={{ textAlign: "center", marginTop: "1.5rem" }}>{actionError}</p>
      )}

      {pendingAction && (
        <ConfirmModal
          title={CONFIRMS[pendingAction].title}
          body={CONFIRMS[pendingAction].body}
          confirmLabel={CONFIRMS[pendingAction].confirmLabel}
          busy={setStatus.isPending}
          onConfirm={() => setStatus.mutate({ sessionId: preview.id, status: pendingAction })}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
