"use client";

import type { QuizLeaderboardRow } from "@/types/database";

interface QuizLeaderboardProps {
  rows: QuizLeaderboardRow[];
  meId?: string | null;
  large?: boolean;
}

// Cumulative quiz scoreboard. Shows only participants who have scored.
export default function QuizLeaderboard({ rows, meId, large }: QuizLeaderboardProps) {
  const ranked = rows.filter((r) => r.total_score > 0 || r.correct_count > 0);
  if (ranked.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      {ranked.map((r, i) => {
        const me = meId === r.user_id;
        return (
          <div
            key={r.user_id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: large ? "0.6rem 0.9rem" : "0.45rem 0.7rem",
              background: me ? "var(--accent)" : "var(--bg-surface)",
              color: me ? "white" : "var(--text-primary)",
              border: "1px solid var(--border-light)",
              borderRadius: 8,
              fontSize: large ? "1.1rem" : "0.9rem",
            }}
          >
            <span style={{ fontWeight: 600 }}>
              <span style={{ opacity: 0.6, marginRight: "0.6rem" }}>{i + 1}</span>
              {r.display_name}
            </span>
            <span style={{ fontWeight: 700 }}>{r.total_score.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}
