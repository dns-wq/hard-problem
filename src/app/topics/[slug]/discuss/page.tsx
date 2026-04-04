"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { createClient } from "@/lib/supabase/client";
import Composer from "@/components/discussion/Composer";
import ContributionList from "@/components/discussion/ContributionList";
import DiscussionLandscape from "@/components/discussion/DiscussionLandscape";
import AIPanel from "@/components/ai/AIPanel";

type SortBy = "recent" | "stance";

export default function DiscussPage() {
  const params = useParams<{ slug: string }>();
  const [currentUserId, setCurrentUserId] = useState<string | null | undefined>(undefined);
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [stanceFilter, setStanceFilter] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  // Detect auth state
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  const { data: topic, isLoading: topicLoading } = trpc.topics.bySlug.useQuery({ slug: params.slug });

  const {
    data: contributions,
    isLoading: contribLoading,
    refetch,
  } = trpc.contributions.listByTopic.useQuery(
    {
      topicId: topic?.id ?? "",
      sortBy,
      stanceFilter: stanceFilter ?? undefined,
      limit: 30,
    },
    { enabled: !!topic?.id },
  );

  const { data: stanceTags } = trpc.contributions.stanceTags.useQuery(
    { topicId: topic?.id ?? "" },
    { enabled: !!topic?.id },
  );

  // Record visit
  const recordVisit = trpc.progress.recordVisit.useMutation();
  useEffect(() => {
    if (currentUserId && topic?.id) {
      recordVisit.mutate({ topicId: topic.id });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, topic?.id]);

  if (topicLoading) {
    return (
      <div className="page-narrow">
        <div style={{ height: 24, background: "var(--bg-surface)", borderRadius: 4, width: "50%", opacity: 0.4, marginBottom: "1rem" }} />
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="page-narrow" style={{ textAlign: "center", paddingTop: "4rem" }}>
        <p style={{ color: "var(--text-muted)" }}>Topic not found.</p>
        <Link href="/topics" className="btn" style={{ marginTop: "1rem", display: "inline-block", textDecoration: "none" }}>
          ← All topics
        </Link>
      </div>
    );
  }

  const totalContribCount = contributions?.length ?? 0;
  const stanceTagsData = stanceTags ?? [];

  return (
    <div style={{ maxWidth: aiOpen ? 1200 : 720, margin: "0 auto", padding: "2rem 1.5rem", transition: "max-width 0.2s ease" }}>
      {/* Breadcrumb + AI toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          <Link href="/topics" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Topics</Link>
          <span>/</span>
          <Link href={`/topics/${topic.slug}`} style={{ color: "var(--text-muted)", textDecoration: "none" }}>{topic.title}</Link>
          <span>/</span>
          <span>Discussion</span>
        </div>
        <button
          type="button"
          className={aiOpen ? "btn btn-primary" : "btn"}
          style={{ fontSize: "0.8rem" }}
          onClick={() => setAiOpen((v) => !v)}
        >
          {aiOpen ? "Close AI Q&A" : "Ask AI"}
        </button>
      </div>

      {/* Two-column layout when AI panel is open */}
      <div style={{ display: "grid", gridTemplateColumns: aiOpen ? "1fr 380px" : "1fr", gap: "1.5rem", alignItems: "start" }}>
        {/* Left: discussion */}
        <div>
          {/* Header */}
          <div style={{ marginBottom: "1.5rem" }}>
            <h1 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "0.5rem", lineHeight: 1.35 }}>
              {topic.title}
            </h1>
            <p style={{ fontSize: "0.9rem", fontStyle: "italic", color: "var(--text-secondary)", lineHeight: 1.55 }}>
              {topic.discussion_prompt}
            </p>
          </div>

          {/* Stance landscape */}
          {stanceTagsData.length > 0 && (
            <DiscussionLandscape
              stanceTags={stanceTagsData}
              activeFilter={stanceFilter}
              onFilterChange={setStanceFilter}
              totalCount={stanceTagsData.reduce((s, t) => s + t.count, 0)}
            />
          )}

          {/* Composer */}
          <Composer
            topicId={topic.id}
            discussionPrompt={topic.discussion_prompt}
            currentUserId={currentUserId ?? null}
            onSuccess={() => refetch()}
          />

          {/* Sort bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {stanceFilter
                ? `Showing: "${stanceFilter}"`
                : totalContribCount > 0
                ? `${totalContribCount} contribution${totalContribCount !== 1 ? "s" : ""}`
                : "No contributions yet"}
            </span>
            <div style={{ display: "flex", gap: "0.25rem" }}>
              {(["recent", "stance"] as SortBy[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSortBy(s)}
                  style={{
                    fontSize: "0.775rem",
                    padding: "0.25rem 0.65rem",
                    borderRadius: 4,
                    border: "1px solid",
                    cursor: "pointer",
                    background: sortBy === s ? "var(--accent)" : "var(--bg-surface)",
                    color: sortBy === s ? "white" : "var(--text-secondary)",
                    borderColor: sortBy === s ? "var(--accent)" : "var(--border)",
                  }}
                >
                  {s === "recent" ? "Recent" : "By stance"}
                </button>
              ))}
            </div>
          </div>

          <ContributionList
            contributions={(contributions ?? []) as Parameters<typeof ContributionList>[0]["contributions"]}
            topicId={topic.id}
            currentUserId={currentUserId ?? null}
            isLoading={contribLoading}
            onMutated={() => refetch()}
          />
        </div>

        {/* Right: AI panel (sticky) */}
        {aiOpen && (
          <div style={{ position: "sticky", top: 80 }}>
            <AIPanel topicId={topic.id} currentUserId={currentUserId ?? null} />
          </div>
        )}
      </div>
    </div>
  );
}
