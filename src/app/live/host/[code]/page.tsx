"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import { trpc } from "@/lib/trpc/client";
import {
  usePlaySessionChannel,
  useHostSessionChannel,
  useSpotlightDrawsChannel,
} from "@/components/live/useLiveChannels";
import TallyBars from "@/components/live/TallyBars";
import ConfirmModal from "@/components/live/ConfirmModal";
import SpotlightStage from "@/components/live/SpotlightStage";
import SpotlightHistory from "@/components/live/SpotlightHistory";
import type { SpotlightMode } from "@/types/database";

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

  return (
    <div className="page" style={{ maxWidth: 900 }}>
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

      {status === "ended" && (
        <div style={{ textAlign: "center", paddingTop: "1rem" }}>
          <p style={{ fontSize: "1.2rem", color: "var(--text-secondary)" }}>
            Session ended — {tally?.total ?? 0} votes from {tally?.participantCount ?? participantCount} participants.
          </p>
          <div style={{ marginTop: "1.5rem", maxWidth: 640, marginLeft: "auto", marginRight: "auto" }}>
            <TallyBars options={tally?.options ?? []} total={tally?.total ?? 0} />
          </div>
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
