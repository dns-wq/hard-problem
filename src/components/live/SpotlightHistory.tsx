"use client";

import type { SpotlightHistoryRow } from "@/types/database";
import { useT } from "@/i18n/LocaleProvider";

interface SpotlightHistoryProps {
  rows: SpotlightHistoryRow[];
}

// Host-only "already called" roster — the no-repeat ledger made visible.
export default function SpotlightHistory({ rows }: SpotlightHistoryProps) {
  const t = useT();
  const called = rows.filter((r) => r.draw_count > 0);
  if (called.length === 0) return null;
  const total = rows[0]?.participant_count ?? rows.length;

  return (
    <div style={{ marginTop: "2rem" }}>
      <h2
        style={{
          fontSize: "0.72rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
          marginBottom: "0.6rem",
        }}
      >
        {t("live.spotlight.history.calledOn", { count: called.length, total })}
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        {called.map((r) => (
          <span key={r.user_id} className="live-chip" style={{ cursor: "default" }}>
            {r.display_name}
            {r.draw_count > 1 ? ` ×${r.draw_count}` : ""}
            {r.last_outcome ? ` · ${t(`live.spotlight.history.outcome.${r.last_outcome}`)}` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
