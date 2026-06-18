"use client";

import { useT } from "@/i18n/LocaleProvider";
import type { LiveTranscriptCounts } from "@/types/database";
import type { Stamp } from "@/lib/stamps";

interface LiveTranscriptProps {
  counts: LiveTranscriptCounts;
  stamps: Stamp[];
  isPrivate?: boolean; // own view, not yet published
}

// Stat labels and the stamp catalog (src/lib/stamps.ts) are localized at THIS render
// site via t(): stats by labelKey, stamps by `transcript.stamp.${stamp.key}.*`.
const STATS: { key: keyof LiveTranscriptCounts; labelKey: string }[] = [
  { key: "sessions_attended", labelKey: "transcript.stat.sessionsAttended" },
  { key: "votes_cast", labelKey: "transcript.stat.votesCast" },
  { key: "times_spotlighted", labelKey: "transcript.stat.timesCalledOn" },
  { key: "times_shared", labelKey: "transcript.stat.timesShared" },
  { key: "quiz_passed_topics", labelKey: "transcript.stat.quizzesPassed" },
];

// The "continuing-education transcript": aggregate counts + earned stamps.
export default function LiveTranscript({ counts, stamps, isPrivate }: LiveTranscriptProps) {
  const t = useT();
  const hasActivity = STATS.some((s) => counts[s.key] > 0);
  if (!hasActivity && stamps.length === 0) {
    return <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t("transcript.empty")}</p>;
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
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>{t(s.labelKey)}</div>
          </div>
        ))}
      </div>

      {stamps.length > 0 && (
        <div style={{ marginTop: "1.25rem", display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
          {stamps.map((s) => (
            <div
              key={s.key}
              title={t(`transcript.stamp.${s.key}.description`)}
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
              {t(`transcript.stamp.${s.key}.label`)}
            </div>
          ))}
        </div>
      )}

      {isPrivate && (
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.9rem" }}>
          {(() => {
            const [before, after] = t("transcript.private").split("{settingsLink}");
            return (
              <>
                {before}
                <a href="/settings" style={{ color: "var(--accent)" }}>{t("transcript.private.settingsLink")}</a>
                {after}
              </>
            );
          })()}
        </p>
      )}
    </div>
  );
}
