"use client";

import type { CurrentSpotlight } from "@/types/database";

interface SpotlightOtherViewProps {
  spotlight: CurrentSpotlight; // is_you === false (caller-gated)
}

// Everyone else's phone while someone is in the spotlight. A pass is never
// surfaced by name (consent) — render nothing for passed/cleared.
export default function SpotlightOtherView({ spotlight }: SpotlightOtherViewProps) {
  if (spotlight.outcome === "passed" || spotlight.outcome === "cleared") return null;

  return (
    <div
      style={{
        padding: "0.9rem 1.1rem",
        border: "1px solid var(--accent)",
        borderRadius: 12,
        background: "var(--bg-surface)",
        marginBottom: "1.25rem",
      }}
    >
      <span
        style={{
          fontSize: "0.72rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--accent)",
        }}
      >
        Spotlight
      </span>
      <p style={{ fontSize: "1rem", fontWeight: 600, marginTop: "0.2rem" }}>
        {spotlight.drawn_display_name} {spotlight.outcome === "shared" ? "is sharing" : "was called on"}
      </p>
      {spotlight.outcome === "shared" && spotlight.note_shared && spotlight.drawn_note && (
        <p style={{ fontSize: "0.9rem", fontStyle: "italic", color: "var(--text-secondary)", marginTop: "0.4rem" }}>
          “{spotlight.drawn_note}”
        </p>
      )}
    </div>
  );
}
