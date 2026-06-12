"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { CurrentSpotlight } from "@/types/database";

interface SpotlightStageProps {
  spotlight: CurrentSpotlight | null;
  rosterNames: string[]; // host-held roster, for the cycling animation
  isDrawing: boolean; // host just hit Draw
  raffleMode: boolean;
}

const MODE_LABEL: Record<string, string> = {
  uniform: "Random draw",
  no_repeat: "No repeats",
  minority_weighted: "Minority favored (3×)",
  minority_steelman: "Minority steelman",
};

const eyebrowStyle: CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--accent)",
};

// Host projector: the cycling-names raffle animation that lands on the drawn
// participant. The landed name is the server's truth (from the refetch / draw
// RPC return) — the animation can only confirm it, never contradict it.
export default function SpotlightStage({ spotlight, rosterNames, isDrawing, raffleMode }: SpotlightStageProps) {
  const [flicker, setFlicker] = useState("");

  useEffect(() => {
    if (!isDrawing || rosterNames.length === 0) return;
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1 + Math.floor(Math.random() * rosterNames.length)) % rosterNames.length;
      setFlicker(rosterNames[i]);
    }, 90);
    return () => clearInterval(id);
  }, [isDrawing, rosterNames]);

  const eyebrow = raffleMode ? "LUCKY DRAW · 摸彩" : "SPOTLIGHT";

  if (isDrawing) {
    return (
      <div style={{ textAlign: "center", padding: "2.5rem 0" }}>
        <span style={eyebrowStyle}>{eyebrow}</span>
        <div className="live-code" style={{ marginTop: "1rem", letterSpacing: "0.04em", textIndent: 0, opacity: 0.85 }}>
          {flicker || rosterNames[0] || "…"}
        </div>
        <p style={{ fontSize: "1rem", color: "var(--text-muted)", marginTop: "1rem" }}>Drawing…</p>
      </div>
    );
  }

  if (!spotlight || spotlight.outcome === "cleared") return null;

  // A pass is never surfaced by name to the room (consent decision) — neutral.
  if (spotlight.outcome === "passed") {
    return (
      <div style={{ textAlign: "center", padding: "2.5rem 0" }}>
        <span style={eyebrowStyle}>{eyebrow}</span>
        <p style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: "1rem", color: "var(--text-secondary)" }}>
          Passed — draw again.
        </p>
      </div>
    );
  }

  const isPending = spotlight.outcome === "pending";
  return (
    <div style={{ textAlign: "center", padding: "2rem 0" }}>
      <span style={eyebrowStyle}>
        {eyebrow}
        {!raffleMode && spotlight.mode ? ` · ${MODE_LABEL[spotlight.mode] ?? ""}` : ""}
      </span>
      <div style={{ fontSize: "3rem", fontWeight: 800, lineHeight: 1.1, marginTop: "1rem" }}>
        {spotlight.drawn_display_name}
      </div>
      <p style={{ fontSize: "1.2rem", color: "var(--text-secondary)", marginTop: "0.75rem" }}>
        {raffleMode ? "🎉 Winner!" : isPending ? "Share your thinking with the room." : "is sharing."}
      </p>
      {isPending && (
        <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
          drawn from {spotlight.pool_size} eligible
          {spotlight.mode === "minority_weighted" ? " · minority voters 3× as likely" : ""}
        </p>
      )}
      {spotlight.outcome === "shared" && spotlight.note_shared && spotlight.drawn_note && (
        <blockquote
          style={{
            marginTop: "1.5rem",
            maxWidth: 640,
            marginLeft: "auto",
            marginRight: "auto",
            fontSize: "1.3rem",
            fontStyle: "italic",
            color: "var(--text-primary)",
            borderLeft: "3px solid var(--accent)",
            paddingLeft: "1rem",
            textAlign: "left",
          }}
        >
          “{spotlight.drawn_note}”
        </blockquote>
      )}
    </div>
  );
}
