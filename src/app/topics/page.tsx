"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import TopicCard from "@/components/topic/TopicCard";
import FilterBar from "@/components/topic/FilterBar";

export default function TopicsPage() {
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("");

  const { data: topics, isLoading } = trpc.topics.list.useQuery({
    difficulty: difficulty as "accessible" | "intermediate" | "advanced" | undefined || undefined,
    search: search || undefined,
    limit: 50,
  });

  const filtered = topics ?? [];

  return (
    <div className="page">
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.4rem" }}>Topics</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Each topic is anchored in a key paper and grounded in a real-world case.
        </p>
      </div>

      <FilterBar
        search={search}
        difficulty={difficulty}
        onSearchChange={setSearch}
        onDifficultyChange={setDifficulty}
      />

      {isLoading ? (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ height: 120, background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: 8, opacity: 0.5 }} />
          ))}
        </div>
      ) : !filtered.length ? (
        <div style={{ textAlign: "center", padding: "3rem 0" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            {search || difficulty ? "No topics match your filters." : "No topics published yet."}
          </p>
          {(search || difficulty) && (
            <button
              type="button"
              className="btn"
              style={{ marginTop: "0.75rem" }}
              onClick={() => { setSearch(""); setDifficulty(""); }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {filtered.map((topic) => (
            <TopicCard
              key={topic.id}
              id={topic.id}
              slug={topic.slug}
              title={topic.title}
              discussion_prompt={topic.discussion_prompt}
              difficulty={topic.difficulty}
              domains={topic.domains ?? []}
              sequence_number={topic.sequence_number}
            />
          ))}
        </div>
      )}
    </div>
  );
}
