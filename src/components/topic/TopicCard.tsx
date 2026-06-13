"use client";

import Link from "next/link";
import { useT } from "@/i18n/LocaleProvider";

const DIFFICULTY_COLOR: Record<string, string> = {
  accessible: "var(--success)",
  intermediate: "#b8791f",
  advanced: "#7b3fa0",
};

interface TopicCardProps {
  id: string;
  slug: string;
  title: string;
  discussion_prompt: string;
  difficulty: string;
  domains: string[];
  sequence_number?: number | null;
  contributionCount?: number;
  activeReaderCount?: number;
}

export default function TopicCard({
  slug,
  title,
  discussion_prompt,
  difficulty,
  domains,
  sequence_number,
  contributionCount,
  activeReaderCount,
}: TopicCardProps) {
  const t = useT();
  return (
    <Link href={`/topics/${slug}`} className="topic-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {sequence_number != null && (
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 500, display: "block", marginBottom: "0.2rem" }}>
              {t("topic.card.sequence", { number: sequence_number })}
            </span>
          )}
          <h2 className="topic-card-title">{title}</h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.55, margin: "0.3rem 0 0.5rem" }}>
            {discussion_prompt}
          </p>
        </div>
        <span
          style={{
            fontSize: "0.68rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: DIFFICULTY_COLOR[difficulty] ?? "var(--text-muted)",
            flexShrink: 0,
            marginTop: "0.1rem",
          }}
        >
          {t(`topic.difficulty.${difficulty}`)}
        </span>
      </div>

      <div className="topic-card-meta">
        {domains.slice(0, 3).map((d) => (
          <span key={d} className="tag">{d.replace(/_/g, " ")}</span>
        ))}
        {contributionCount != null && (
          <span>{t(contributionCount === 1 ? "topic.stats.discussions.one" : "topic.stats.discussions.other", { count: contributionCount })}</span>
        )}
        {activeReaderCount != null && activeReaderCount > 0 && (
          <span>{t("topic.stats.readingNow", { count: activeReaderCount })}</span>
        )}
      </div>
    </Link>
  );
}
