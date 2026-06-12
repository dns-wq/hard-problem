"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc/client";
import { usePlaySessionChannel } from "@/components/live/useLiveChannels";
import TallyBars from "@/components/live/TallyBars";
import SpotlightCallout from "@/components/live/SpotlightCallout";
import SpotlightOtherView from "@/components/live/SpotlightOtherView";

function PlayInner({ code }: { code: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [joined, setJoined] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const [editingVote, setEditingVote] = useState(false);

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
      Open to being called on to share aloud
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
      // The "it's you" callout must surface within 5s even with no websocket
      if (spotlightActive) currentSpotlightQuery.refetch();
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
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </div>
    );
  }

  // Signed out: explainer + deep-linking sign-in (works thanks to the §8 fixes)
  if (!user) {
    return (
      <div className="auth-container" style={{ textAlign: "center" }}>
        <h1 className="auth-title">Join the live session</h1>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: "1.5rem" }}>
          The room is voting on a question from Hard Problem. Sign in (or create
          an account — it takes two taps with Google) and you&apos;ll land right
          back here.
        </p>
        <Link
          href={`/auth/login?redirect=${encodeURIComponent(`/live/play/${code}`)}`}
          className="btn btn-primary"
          style={{ display: "inline-block", textDecoration: "none" }}
        >
          Sign in to join
        </Link>
      </div>
    );
  }

  if (byCode.error || !preview) {
    return (
      <div className="page-narrow" style={{ textAlign: "center", paddingTop: "4rem" }}>
        <p style={{ color: "var(--text-muted)" }}>
          {byCode.error?.message ?? "No session with that code."}
        </p>
        <Link href="/live" className="btn" style={{ marginTop: "1rem", display: "inline-block", textDecoration: "none" }}>
          ← Try another code
        </Link>
      </div>
    );
  }

  const options = sessionQuery.data?.options ?? [];
  const tally = tallyQuery.data;

  return (
    <div className="page-narrow" style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
          {raffle ? "LUCKY DRAW · 摸彩" : preview.topic_title}
        </span>
        <h1 style={{ fontSize: "1.15rem", fontWeight: 700, lineHeight: 1.4, marginTop: "0.4rem" }}>
          {raffle ? "Prize Draw" : session?.question || preview.question}
        </h1>
      </div>

      {preview.is_host && (
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
          You&apos;re the host —{" "}
          <Link href={`/live/host/${code}`} style={{ color: "var(--accent)" }}>
            open the host screen
          </Link>{" "}
          to run the room.
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
              {spotlight.outcome === "shared" ? "You're sharing 🎤" : "You passed — no worries."}
            </p>
            {spotlight.outcome === "shared" && (
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                {spotlight.note_shared ? "Your note is on the screen." : "Your note stays private to you."}
              </p>
            )}
          </div>
        ) : !spotlight.is_you ? (
          <SpotlightOtherView spotlight={spotlight} />
        ) : null
      )}

      {/* Not yet a member while the room is live: joining / join-failed states */}
      {(status === "lobby" || status === "voting") && !isMember && (
        join.isError ? (
          <div style={{ textAlign: "center", paddingTop: "1.5rem" }}>
            <p className="auth-error">Couldn&apos;t join: {join.error.message}</p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: "1rem" }}
              onClick={() => join.mutate({ sessionId: preview.id })}
            >
              Try again
            </button>
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)" }}>Joining…</p>
        )
      )}

      {status === "lobby" && isMember && (
        <div style={{ textAlign: "center", paddingTop: "2rem" }}>
          <p style={{ fontSize: "1.3rem", fontWeight: 700 }}>You&apos;re in.</p>
          <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
            Keep this page open — {raffle ? "the draw" : "voting"} starts when the host opens it.
          </p>
          {consentToggle && <div style={{ marginTop: "1.5rem" }}>{consentToggle}</div>}
        </div>
      )}

      {status === "voting" && isMember && !preview.is_host && (
        <div>
          {voteSubmitted && !editingVote ? (
            <div style={{ textAlign: "center", paddingTop: "1.5rem" }}>
              <p style={{ fontSize: "1.1rem", fontWeight: 700 }}>Vote recorded.</p>
              <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginTop: "0.4rem" }}>
                You chose{" "}
                <strong>{options.find((o) => o.id === selectedOption)?.label ?? "—"}</strong>.
                Results appear when the host reveals them.
              </p>
              <button type="button" className="btn" style={{ marginTop: "1.25rem" }} onClick={() => setEditingVote(true)}>
                Change vote
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
                  Why? <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional, {140 - note.length} left)</span>
                </label>
                <textarea
                  id="live-note"
                  className="form-textarea"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 140))}
                  rows={2}
                  maxLength={140}
                  placeholder="One line on your reasoning…"
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
                {vote.isPending ? "Submitting…" : voteSubmitted ? "Update vote" : "Submit vote"}
              </button>
            </div>
          )}
          {consentToggle && <div style={{ textAlign: "center", marginTop: "1.5rem" }}>{consentToggle}</div>}
        </div>
      )}

      {status === "voting" && preview.is_host && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Voting is open — watch the tally on the host screen.
        </p>
      )}

      {(status === "revealed" || status === "ended") && (
        <div>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "1rem" }}>
            {status === "revealed" ? "Results" : "Final results"}
            {tally ? ` · ${tally.total} votes` : ""}
          </h2>
          <TallyBars
            options={tally?.options ?? []}
            total={tally?.total ?? 0}
            highlightOptionId={myResponse?.option_id ?? null}
          />
          {status === "revealed" && !preview.is_host && (
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "1.25rem" }}>
              The host may reopen voting — keep this page open.
            </p>
          )}
          {status === "ended" && (
            <div style={{ textAlign: "center", marginTop: "2rem" }}>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                Session over — the conversation continues in the topic discussion.
              </p>
              <Link
                href={`/topics/${preview.topic_slug}/discuss`}
                className="btn btn-primary"
                style={{ display: "inline-block", textDecoration: "none" }}
              >
                Join the discussion →
              </Link>
            </div>
          )}
        </div>
      )}
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
