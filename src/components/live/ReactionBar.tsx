"use client";

import type { ReactionKind } from "@/types/database";

const PRESETS: { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: "applause", emoji: "👏", label: "Applause" },
  { kind: "laugh", emoji: "😂", label: "Laugh" },
  { kind: "mindblown", emoji: "🤯", label: "Mind blown" },
  { kind: "heart", emoji: "❤️", label: "Heart" },
];

// Tap a preset to broadcast an ephemeral reaction to the room (client-throttled).
export default function ReactionBar({ onReact }: { onReact: (kind: ReactionKind) => void }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
      {PRESETS.map((p) => (
        <button
          key={p.kind}
          type="button"
          aria-label={p.label}
          onClick={() => onReact(p.kind)}
          style={{
            fontSize: "1.5rem",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-light)",
            borderRadius: 999,
            width: 48,
            height: 48,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          {p.emoji}
        </button>
      ))}
    </div>
  );
}
