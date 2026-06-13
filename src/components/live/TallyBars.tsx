"use client";

import { useT } from "@/i18n/LocaleProvider";

interface TallyBarOption {
  optionId: string;
  label: string;
  count: number;
}

interface TallyBarsProps {
  options: TallyBarOption[];
  total: number;
  // Participant's own choice, highlighted on the phone reveal view
  highlightOptionId?: string | null;
  // Projector mode: distance-readable type
  large?: boolean;
}

// Proportional result bars — visual language borrowed from DiscussionLandscape
export default function TallyBars({ options, total, highlightOptionId, large }: TallyBarsProps) {
  const t = useT();
  if (!options.length) return null;

  const max = Math.max(...options.map((o) => o.count), 1);
  const labelSize = large ? "1.3rem" : "0.85rem";
  const countSize = large ? "1.1rem" : "0.75rem";
  const barHeight = large ? 18 : 8;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: large ? "1.1rem" : "0.6rem" }}>
      {options.map(({ optionId, label, count }) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const barWidth = (count / max) * 100;
        // Case-insensitive: the quiz aggregate lowercases T/F labels while the
        // stored correct_answer keeps its authored casing
        const isMine = highlightOptionId != null && highlightOptionId.toLowerCase() === optionId.toLowerCase();

        return (
          <div key={optionId}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <span
                style={{
                  fontSize: labelSize,
                  fontWeight: isMine ? 700 : 500,
                  color: isMine ? "var(--accent)" : "var(--text-primary)",
                }}
              >
                {label}
                {isMine && (
                  <span style={{ fontSize: countSize, fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>
                    {t("live.tally.yourVote")}
                  </span>
                )}
              </span>
              <span style={{ fontSize: countSize, color: "var(--text-muted)", whiteSpace: "nowrap", marginLeft: 12 }}>
                {count} · {pct}%
              </span>
            </div>
            <div style={{ position: "relative", height: barHeight, background: "var(--bg-secondary)", borderRadius: barHeight / 2, overflow: "hidden" }}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${barWidth}%`,
                  background: isMine ? "var(--accent)" : "var(--accent-soft)",
                  borderRadius: barHeight / 2,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
