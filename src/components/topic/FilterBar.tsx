"use client";

import { useT } from "@/i18n/LocaleProvider";

const DIFFICULTIES = [
  { value: "", labelKey: "topic.difficulty.all" },
  { value: "accessible", labelKey: "topic.difficulty.accessible" },
  { value: "intermediate", labelKey: "topic.difficulty.intermediate" },
  { value: "advanced", labelKey: "topic.difficulty.advanced" },
];

interface FilterBarProps {
  search: string;
  difficulty: string;
  onSearchChange: (v: string) => void;
  onDifficultyChange: (v: string) => void;
}

export default function FilterBar({ search, difficulty, onSearchChange, onDifficultyChange }: FilterBarProps) {
  const t = useT();
  return (
    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={t("topics.filter.searchPlaceholder")}
        style={{
          flex: "1 1 200px",
          fontSize: "0.875rem",
          padding: "0.5rem 0.75rem",
          border: "1px solid var(--border)",
          borderRadius: 6,
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          outline: "none",
          minWidth: 0,
        }}
      />
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {DIFFICULTIES.map(({ value, labelKey }) => (
          <button
            key={value}
            type="button"
            onClick={() => onDifficultyChange(value)}
            style={{
              fontSize: "0.775rem",
              padding: "0.3rem 0.8rem",
              borderRadius: 20,
              border: "1px solid",
              cursor: "pointer",
              fontWeight: difficulty === value ? 600 : 400,
              background: difficulty === value ? "var(--accent)" : "var(--bg-surface)",
              color: difficulty === value ? "white" : "var(--text-secondary)",
              borderColor: difficulty === value ? "var(--accent)" : "var(--border)",
              transition: "all 0.15s",
            }}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
