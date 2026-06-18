"use client";

import type { ReactionKind } from "@/types/database";
import { useT } from "@/i18n/LocaleProvider";

const PRESETS: { kind: ReactionKind; emoji: string }[] = [
  { kind: "applause", emoji: "👏" },
  { kind: "laugh", emoji: "😂" },
  { kind: "mindblown", emoji: "🤯" },
  { kind: "heart", emoji: "❤️" },
];

// Tap a preset to broadcast an ephemeral reaction to the room (client-throttled).
export default function ReactionBar({ onReact }: { onReact: (kind: ReactionKind) => void }) {
  const t = useT();
  return (
    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
      {PRESETS.map((p) => (
        <button
          key={p.kind}
          type="button"
          aria-label={t(`live.reaction.label.${p.kind}`)}
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
