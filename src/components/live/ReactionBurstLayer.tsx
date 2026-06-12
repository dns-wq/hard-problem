"use client";

import type { ReactionKind } from "@/types/database";

const EMOJI: Record<ReactionKind, string> = {
  applause: "👏",
  laugh: "😂",
  mindblown: "🤯",
  heart: "❤️",
};

export interface ReactionBurst {
  id: string;
  kind: ReactionKind;
  left: number; // 0-100 (% from left)
}

// Floating emoji bursts that rise and fade. The parent owns the list and prunes
// each burst after the animation (~2s). Purely visual — never persisted.
export default function ReactionBurstLayer({ bursts }: { bursts: ReactionBurst[] }) {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 50 }}>
      {bursts.map((b) => (
        <span
          key={b.id}
          className="reaction-burst"
          style={{ position: "absolute", bottom: "8%", left: `${b.left}%`, fontSize: "2rem" }}
        >
          {EMOJI[b.kind]}
        </span>
      ))}
    </div>
  );
}
