"use client";

import type { LiveTranscriptCounts } from "@/types/database";
import type { Stamp } from "@/lib/stamps";

interface LiveTranscriptProps {
  counts: LiveTranscriptCounts;
  stamps: Stamp[];
  isPrivate?: boolean; // own view, not yet published
}

const STATS: { key: keyof LiveTranscriptCounts; label: string }[] = [
  { key: "sessions_attended", label: "Sessions attended" },
  { key: "votes_cast", label: "Votes cast" },
  { key: "times_spotlighted", label: "Times called on" },
  { key: "times_shared", label: "Times shared" },
  { key: "quiz_passed_topics", label: "Quizzes passed" },
];

// The "continuing-education transcript": aggregate counts + earned stamps.
export default function LiveTranscript({ counts, stamps, isPrivate }: LiveTranscriptProps) {
  const hasActivity = STATS.some((s) => counts[s.key] > 0);
  if (!hasActivity && stamps.length === 0) {
    return <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No live-session activity yet.</p>;
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.6rem" }}>
        {STATS.map((s) => (
          <div
            key={s.key}
            style={{ padding: "0.85rem", background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: 10, textAlign: "center" }}
          >
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--accent)" }}>{counts[s.key]}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {stamps.length > 0 && (
        <div style={{ marginTop: "1.25rem", display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
          {stamps.map((s) => (
            <div
              key={s.key}
              title={s.description}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.4rem 0.75rem",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-light)",
                borderRadius: 999,
                fontSize: "0.82rem",
              }}
            >
              <span style={{ fontSize: "1.1rem" }}>{s.emoji}</span>
              {s.label}
            </div>
          ))}
        </div>
      )}

      {isPrivate && (
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.9rem" }}>
          Private — only you can see this. Publish it in <a href="/settings" style={{ color: "var(--accent)" }}>settings</a>.
        </p>
      )}
    </div>
  );
}
