"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc/client";
import { useT } from "@/i18n/LocaleProvider";
import { usePlaySessionChannel, useReactionsChannel } from "@/components/live/useLiveChannels";
import TallyBars from "@/components/live/TallyBars";
import SpotlightCallout from "@/components/live/SpotlightCallout";
import SpotlightOtherView from "@/components/live/SpotlightOtherView";
import QuizQuestionCard from "@/components/live/QuizQuestionCard";
import QuizLeaderboard from "@/components/live/QuizLeaderboard";
import ReactionBar from "@/components/live/ReactionBar";
import ReactionBurstLayer, { type ReactionBurst } from "@/components/live/ReactionBurstLayer";
import type { ReactionKind } from "@/types/database";
import RundownParticipant from "@/components/live/RundownParticipant";

function PlayInner({ code }: { code: string }) {
  const t = useT();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [joined, setJoined] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const [editingVote, setEditingVote] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // Guest join: an anonymous Supabase session (no account). Setting `user`
  // re-renders → byCode runs → the auto-join effect fires, so the guest lands
  // in the room directly. handle_new_user (010) gives them a profile row.
  async function handleGuestJoin() {
    const name = guestName.trim();
    if (!name) {
      setGuestError(t("live.guest.error.noName"));
      return;
    }
    if (!turnstileSiteKey || !captchaToken) {
      setGuestError(t("live.guest.error.captcha"));
      return;
    }
    setGuestLoading(true);
    setGuestError("");
    const { data, error } = await createClient().auth.signInAnonymously({
      options: {
        data: { display_name: name.slice(0, 40) },
        captchaToken,
      },
    });
    if (error) {
      turnstileRef.current?.reset();
      setCaptchaToken(null);
      setGuestError(error.message);
      setGuestLoading(false);
      return;
    }
    setUser(data.user);
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthChecked(true);
    });
  }, []);

  const utils = trpc.useUtils();
  const byCode = trpc.live.byCode.useQuery(
    { code },
    { enabled: authChecked && !!user, retry: false },
  );
  const preview = byCode.data;

  const join = trpc.live.join.useMutation({
    onSuccess: () => setJoined(true),
    // Status races (host revealed between fetch and join) are non-fatal:
    // re-resolve and render the spectator/ended view from byCode. Transient
    // failures keep join.isError set — the UI offers a manual retry below.
    onError: () => byCode.refetch(),
  });

  // Join gating: only while lobby/voting, only when not already a member.
  // Opening the link while the session is live IS joining (the roster is the
  // attendance record); revealed/ended renders spectator views, no join attempt.
  useEffect(() => {
    if (!preview || join.isPending || join.isError || joined) return;
    if (preview.is_participant || preview.is_host) return;
    if (preview.status === "lobby" || preview.status === "voting") {
      join.mutate({ sessionId: preview.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview?.id, preview?.status]);

  const isMember = joined || !!preview?.is_participant || !!preview?.is_host;

  const sessionQuery = trpc.live.bySessionId.useQuery(
    { sessionId: preview?.id ?? "" },
    { enabled: !!preview?.id && isMember },
  );
  const session = sessionQuery.data?.session;
  const status = session?.status ?? preview?.status;
  const raffle = !!session?.raffle_mode;

  // Spotlight (orthogonal to the vote machine): drawn in voting AND revealed
  const spotlightActive = status === "voting" || status === "revealed";
  const currentSpotlightQuery = trpc.live.currentSpotlight.useQuery(
    { sessionId: preview?.id ?? "" },
    { enabled: !!preview?.id && isMember && spotlightActive },
  );
  const spotlight = currentSpotlightQuery.data ?? null;

  const passDraw = trpc.live.passDraw.useMutation({
    onSuccess: () => currentSpotlightQuery.refetch(),
  });
  const shareDraw = trpc.live.shareDraw.useMutation({
    onSuccess: () => currentSpotlightQuery.refetch(),
  });

  // Quiz (orthogonal — rides the same voting/revealed window)
  const currentQuizRoundQuery = trpc.live.currentQuizRound.useQuery(
    { sessionId: preview?.id ?? "" },
    { enabled: !!preview?.id && isMember && spotlightActive },
  );
  const quizRound = currentQuizRoundQuery.data ?? null;
  const submitQuizAnswer = trpc.live.submitQuizAnswer.useMutation({
    onSuccess: () => currentQuizRoundQuery.refetch(),
  });
  // Clear a stale submit error when the host moves to a new question
  useEffect(() => {
    submitQuizAnswer.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizRound?.round_id]);
  const quizLeaderboardQuery = trpc.live.quizLeaderboard.useQuery(
    { sessionId: preview?.id ?? "" },
    { enabled: !!preview?.id && isMember && quizRound?.status === "revealed", retry: false },
  );

  // Reactions — ephemeral broadcast; the burst list is pruned after each animation
  const [bursts, setBursts] = useState<ReactionBurst[]>([]);
  const burstSeq = useRef(0);
  const addBurst = useCallback((kind: ReactionKind) => {
    const id = `${Date.now()}-${burstSeq.current++}`;
    setBursts((b) => [...b, { id, kind, left: 10 + Math.random() * 80 }]);
    setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 2100);
  }, []);
  const sendReaction = useReactionsChannel(preview?.id, isMember && spotlightActive, addBurst);

  // Consent: "open to being called on" (default true). Synced from the server
  // so a reconnect reflects the real value, toggleable while in the room.
  const [callablePref, setCallablePref] = useState(true);
  useEffect(() => {
    if (typeof sessionQuery.data?.myCallable === "boolean") setCallablePref(sessionQuery.data.myCallable);
  }, [sessionQuery.data?.myCallable]);
  const setCallable = trpc.live.setCallable.useMutation();
  function toggleCallable(next: boolean) {
    setCallablePref(next);
    if (preview) setCallable.mutate({ sessionId: preview.id, callable: next });
  }
  // Ongoing opt-out (invariant #5) — available in the lobby AND during voting so
  // a participant can withdraw before their name could ever be drawn. Hidden in
  // raffle mode (door-prize implicit consent).
  const consentToggle = !raffle ? (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)", cursor: "pointer" }}>
      <input type="checkbox" checked={callablePref} onChange={(e) => toggleCallable(e.target.checked)} />
      {t("live.play.consent.callable")}
    </label>
  ) : null;

  // Polling fallback (members) — covers lobby/voting AND revealed: the UI
  // tells people "the host may reopen voting — keep this page open", so a
  // dropped websocket must not strand them at stale results.
  const memberPolling = isMember && (status === "lobby" || status === "voting" || status === "revealed");
  useEffect(() => {
    if (!memberPolling || !preview?.id) return;
    const interval = setInterval(() => {
      sessionQuery.refetch();
      // The "it's you" callout and the live quiz must surface within 5s even
      // with no websocket
      if (spotlightActive) {
        currentSpotlightQuery.refetch();
        currentQuizRoundQuery.refetch();
      }
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberPolling, spotlightActive, preview?.id]);

  // Non-member spectators (arrived at revealed) poll byCode slowly so a
  // reopen flips preview.status and the join effect can fire. 6/min is well
  // under the 30/min non-member rate limit.
  useEffect(() => {
    if (!preview || isMember || status === "ended") return;
    const interval = setInterval(() => {
      byCode.refetch();
    }, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview?.id, isMember, status]);

  // Subscribe only after membership is established (events before the
  // participant row commits are dropped by per-subscriber RLS, not queued)
  usePlaySessionChannel(preview?.id, isMember, (next) => {
    sessionQuery.refetch();
    currentSpotlightQuery.refetch(); // a draw / clear flips the session pointer
    currentQuizRoundQuery.refetch(); // a quiz push / reveal re-touches the pointer
    if (next.status === "revealed" || next.status === "ended") {
      utils.live.tally.invalidate({ sessionId: next.id });
    }
  });

  const tallyQuery = trpc.live.tally.useQuery(
    { sessionId: preview?.id ?? "" },
    { enabled: !!preview?.id && (status === "revealed" || status === "ended") },
  );

  const myResponse = sessionQuery.data?.myResponse ?? null;

  // Seed the vote form from an existing response (reconnect path)
  useEffect(() => {
    if (myResponse && !voteSubmitted && !editingVote) {
      setSelectedOption(myResponse.option_id);
      setNote(myResponse.note ?? "");
      setVoteSubmitted(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myResponse?.option_id]);

  const vote = trpc.live.vote.useMutation({
    onSuccess: () => {
      setVoteSubmitted(true);
      setEditingVote(false);
      sessionQuery.refetch();
    },
  });

  // ----- Render states -----

  if (!authChecked || (user && byCode.isLoading)) {
    return (
      <div className="page-narrow">
        <p style={{ color: "var(--text-muted)" }}>{t("common.loading")}</p>
      </div>
    );
  }

  // Signed out: explainer + deep-linking sign-in (works thanks to the §8 fixes)
  if (!user) {
    return (
      <div className="auth-container" style={{ textAlign: "center" }}>
        <h1 className="auth-title">{t("live.guest.title")}</h1>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: "1.25rem" }}>
          {t("live.guest.hint")}
        </p>
        <form className="auth-form" onSubmit={(e) => { e.preventDefault(); handleGuestJoin(); }}>
          <input
            className="auth-input"
            type="text"
            placeholder={t("live.guest.namePlaceholder")}
            value={guestName}
            onChange={(e) => { setGuestName(e.target.value); setGuestError(""); }}
            maxLength={40}
            autoComplete="off"
            autoFocus
          />
          {turnstileSiteKey ? (
            <Turnstile
              ref={turnstileRef}
              siteKey={turnstileSiteKey}
              onSuccess={setCaptchaToken}
              onExpire={() => setCaptchaToken(null)}
              onError={() => {
                setCaptchaToken(null);
                setGuestError(t("live.guest.error.captcha"));
              }}
              options={{ theme: "auto" }}
            />
          ) : (
            <p className="auth-error">{t("live.guest.error.captchaUnavailable")}</p>
          )}
          {guestError && <p className="auth-error">{guestError}</p>}
          <button className="auth-submit" type="submit" disabled={guestLoading || !guestName.trim() || !captchaToken}>
            {guestLoading ? t("live.guest.cta.loading") : t("live.guest.cta")}
          </button>
        </form>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "1.25rem" }}>
          {t("live.guest.haveAccount")}{" "}
          <Link href={`/auth/login?redirect=${encodeURIComponent(`/live/play/${code}`)}`} style={{ color: "var(--accent)" }}>
            {t("live.guest.signIn")}
          </Link>
        </p>
      </div>
    );
  }

  if (byCode.error || !preview) {
    return (
      <div className="page-narrow" style={{ textAlign: "center", paddingTop: "4rem" }}>
        <p style={{ color: "var(--text-muted)" }}>
          {byCode.error?.message ?? t("live.error.noSession")}
        </p>
        <Link href="/live" className="btn" style={{ marginTop: "1rem", display: "inline-block", textDecoration: "none" }}>
          {t("live.play.cta.tryAnotherCode")}
        </Link>
      </div>
    );
  }

  if (session?.format_version === 2) {
    return <RundownParticipant sessionId={session.id} topicTitle={preview.topic_title} ended={session.status === "ended"} />;
  }

  const options = sessionQuery.data?.options ?? [];
  const tally = tallyQuery.data;

  return (
    <div className="page-narrow" style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
          {raffle ? t("live.raffle.eyebrow") : preview.topic_title}
        </span>
        <h1 style={{ fontSize: "1.15rem", fontWeight: 700, lineHeight: 1.4, marginTop: "0.4rem" }}>
          {raffle ? t("live.raffle.title") : session?.question || preview.question}
        </h1>
      </div>

      {preview.is_host && (
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
          {(() => {
            const [before, after] = t("live.play.host.banner").split("{link}");
            return (
              <>
                {before}
                <Link href={`/live/host/${code}`} style={{ color: "var(--accent)" }}>
                  {t("live.play.host.bannerLink")}
                </Link>
                {after}
              </>
            );
          })()}
        </p>
      )}

      {/* Spotlight: the drawn phone gets the interactive callout; everyone else a
          slim banner. A pass is never surfaced by name to others (consent).
          Gated on spotlightActive so the surface vanishes the instant the
          session leaves voting/revealed (the pointer isn't nulled on end). */}
      {isMember && spotlightActive && spotlight && (
        spotlight.is_you && spotlight.outcome === "pending" ? (
          <SpotlightCallout
            key={spotlight.draw_id}
            spotlight={spotlight}
            raffleMode={raffle}
            busy={passDraw.isPending || shareDraw.isPending}
            errorMessage={passDraw.error?.message || shareDraw.error?.message || undefined}
            onShare={(showNote) => shareDraw.mutate({ drawId: spotlight.draw_id, shareNote: showNote })}
            onPass={() => passDraw.mutate({ drawId: spotlight.draw_id })}
          />
        ) : spotlight.is_you && (spotlight.outcome === "shared" || spotlight.outcome === "passed") ? (
          <div style={{ textAlign: "center", padding: "1rem 1.25rem", border: "1px solid var(--border-light)", borderRadius: 12, background: "var(--bg-surface)", marginBottom: "1.5rem" }}>
            <p style={{ fontSize: "1rem", fontWeight: 700 }}>
              {spotlight.outcome === "shared" ? t("live.spotlight.you.sharing") : t("live.spotlight.you.passed")}
            </p>
            {spotlight.outcome === "shared" && (
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                {spotlight.note_shared ? t("live.spotlight.you.noteOnScreen") : t("live.spotlight.you.notePrivate")}
              </p>
            )}
          </div>
        ) : !spotlight.is_you ? (
          <SpotlightOtherView spotlight={spotlight} />
        ) : null
      )}

      {/* Live quiz: participants answer; the host runs it from the host screen */}
      {isMember && spotlightActive && !preview.is_host && quizRound && (
        <div style={{ marginBottom: "1.5rem" }}>
          <QuizQuestionCard
            key={quizRound.round_id}
            round={quizRound}
            busy={submitQuizAnswer.isPending}
            errorMessage={submitQuizAnswer.error?.message || undefined}
            onAnswer={(answer) => submitQuizAnswer.mutate({ sessionId: preview.id, roundId: quizRound.round_id, answer })}
          />
          {quizRound.status === "revealed" && !!quizLeaderboardQuery.data?.length && (
            <div style={{ marginTop: "1.25rem" }}>
              <h3 style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                {t("live.quiz.leaderboard")}
              </h3>
              <QuizLeaderboard rows={quizLeaderboardQuery.data} meId={user?.id} />
            </div>
          )}
        </div>
      )}

      {/* Not yet a member while the room is live: joining / join-failed states */}
      {(status === "lobby" || status === "voting") && !isMember && (
        join.isError ? (
          <div style={{ textAlign: "center", paddingTop: "1.5rem" }}>
            <p className="auth-error">{t("live.play.join.failed", { message: join.error.message })}</p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: "1rem" }}
              onClick={() => join.mutate({ sessionId: preview.id })}
            >
              {t("live.play.cta.tryAgain")}
            </button>
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)" }}>{t("live.play.status.joining")}</p>
        )
      )}

      {status === "lobby" && isMember && (
        <div style={{ textAlign: "center", paddingTop: "2rem" }}>
          <p style={{ fontSize: "1.3rem", fontWeight: 700 }}>{t("live.play.lobby.youreIn")}</p>
          <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
            {t("live.play.lobby.keepOpen", { what: raffle ? t("live.play.lobby.keepOpen.draw") : t("live.play.lobby.keepOpen.voting") })}
          </p>
          {consentToggle && <div style={{ marginTop: "1.5rem" }}>{consentToggle}</div>}
        </div>
      )}

      {status === "voting" && isMember && !preview.is_host && (
        <div>
          {voteSubmitted && !editingVote ? (
            <div style={{ textAlign: "center", paddingTop: "1.5rem" }}>
              <p style={{ fontSize: "1.1rem", fontWeight: 700 }}>{t("live.vote.recorded.title")}</p>
              <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginTop: "0.4rem" }}>
                {(() => {
                  const choice = options.find((o) => o.id === selectedOption)?.label ?? "—";
                  const [before, after] = t("live.vote.recorded.body").split("{choice}");
                  return <>{before}<strong>{choice}</strong>{after}</>;
                })()}
              </p>
              <button type="button" className="btn" style={{ marginTop: "1.25rem" }} onClick={() => setEditingVote(true)}>
                {t("live.vote.cta.changeVote")}
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                {options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`live-option-btn${selectedOption === o.id ? " selected" : ""}`}
                    onClick={() => setSelectedOption(o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="live-note">
                  {t("live.vote.note.label")} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>{t("live.vote.note.optionalHint", { n: 140 - note.length })}</span>
                </label>
                <textarea
                  id="live-note"
                  className="form-textarea"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 140))}
                  rows={2}
                  maxLength={140}
                  placeholder={t("live.vote.note.placeholder")}
                />
              </div>
              {vote.error && (
                <p className="auth-error" style={{ marginBottom: "0.75rem" }}>{vote.error.message}</p>
              )}
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "100%" }}
                disabled={!selectedOption || vote.isPending}
                onClick={() =>
                  selectedOption &&
                  vote.mutate({
                    sessionId: preview.id,
                    optionId: selectedOption,
                    note: note.trim() || undefined,
                  })
                }
              >
                {vote.isPending ? t("live.vote.cta.submitting") : voteSubmitted ? t("live.vote.cta.update") : t("live.vote.cta.submit")}
              </button>
            </div>
          )}
          {consentToggle && <div style={{ textAlign: "center", marginTop: "1.5rem" }}>{consentToggle}</div>}
        </div>
      )}

      {status === "voting" && preview.is_host && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
          {t("live.play.host.votingOpen")}
        </p>
      )}

      {(status === "revealed" || status === "ended") && (
        <div>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "1rem" }}>
            {status === "revealed" ? t("live.play.results.title") : t("live.play.results.titleFinal")}
            {tally ? t("live.play.results.voteCount", { total: tally.total }) : ""}
          </h2>
          <TallyBars
            options={tally?.options ?? []}
            total={tally?.total ?? 0}
            highlightOptionId={myResponse?.option_id ?? null}
          />
          {status === "revealed" && !preview.is_host && (
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "1.25rem" }}>
              {t("live.play.revealed.keepOpen")}
            </p>
          )}
          {status === "ended" && (
            <div style={{ textAlign: "center", marginTop: "2rem" }}>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                {t("live.ended.body")}
              </p>
              <Link
                href={`/topics/${preview.topic_slug}/discuss`}
                className="btn btn-primary"
                style={{ display: "inline-block", textDecoration: "none" }}
              >
                {t("live.ended.cta.joinDiscussion")}
              </Link>
            </div>
          )}
        </div>
      )}

      {isMember && spotlightActive && (
        <div style={{ position: "sticky", bottom: 0, marginTop: "2rem", padding: "0.75rem 0", background: "var(--bg-surface)", borderTop: "1px solid var(--border-light)" }}>
          <ReactionBar onReact={(kind) => { addBurst(kind); sendReaction(kind); }} />
        </div>
      )}
      <ReactionBurstLayer bursts={bursts} />
    </div>
  );
}

// Keyed by code: per-session state (joined, vote form) must reset when
// history navigation moves between two play pages without a remount.
export default function PlaySessionPage() {
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();
  return <PlayInner key={code} code={code} />;
}
