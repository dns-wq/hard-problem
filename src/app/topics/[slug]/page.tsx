"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import FramingSection from "@/components/topic/FramingSection";
import RealWorldAnchor from "@/components/topic/RealWorldAnchor";
import PapersSection from "@/components/topic/PapersSection";
import ConceptChip from "@/components/topic/ConceptChip";
import VideosSection from "@/components/topic/VideosSection";

const DIFFICULTY_COLOR: Record<string, string> = {
  accessible: "#2a7a3b",
  intermediate: "#3b6ea5",
  advanced: "#7b3fa0",
};

export default function TopicPage() {
  const params = useParams<{ slug: string }>();

  const { data: topic, isLoading, error } = trpc.topics.bySlug.useQuery({ slug: params.slug });
  const { data: papers } = trpc.papers.byTopic.useQuery(
    { topicId: topic?.id ?? "" },
    { enabled: !!topic?.id },
  );
  const { data: concepts } = trpc.concepts.byTopic.useQuery(
    { topicId: topic?.id ?? "" },
    { enabled: !!topic?.id },
  );
  const { data: stats } = trpc.topics.stats.useQuery(
    { topicId: topic?.id ?? "" },
    { enabled: !!topic?.id },
  );

  if (isLoading) {
    return (
      <div className="page-narrow">
        <div style={{ height: 32, background: "var(--bg-surface)", borderRadius: 4, marginBottom: "1rem", opacity: 0.5 }} />
        <div style={{ height: 16, background: "var(--bg-surface)", borderRadius: 4, width: "60%", opacity: 0.4 }} />
      </div>
    );
  }

  if (error || !topic) {
    return (
      <div className="page-narrow" style={{ textAlign: "center", paddingTop: "4rem" }}>
        <p style={{ color: "var(--text-muted)" }}>Topic not found.</p>
        <Link href="/topics" className="btn" style={{ marginTop: "1rem", display: "inline-block", textDecoration: "none" }}>
          ← All topics
        </Link>
      </div>
    );
  }

  const anchor = topic.real_world_anchor as { title?: string; body?: string; source_url?: string } | null;

  return (
    <div className="page-narrow">
      {/* Breadcrumb */}
      <Link href="/topics" style={{ fontSize: "0.8rem", color: "var(--text-muted)", textDecoration: "none", display: "inline-block", marginBottom: "1.5rem" }}>
        ← Topics
      </Link>

      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.6rem" }}>
          <span
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: DIFFICULTY_COLOR[topic.difficulty] ?? "var(--text-muted)",
            }}
          >
            {topic.difficulty}
          </span>
          {(topic.domains ?? []).slice(0, 3).map((d: string) => (
            <span key={d} className="tag">{d.replace(/_/g, " ")}</span>
          ))}
          {stats && (
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "auto" }}>
              {stats.contributionCount} discussion{stats.contributionCount !== 1 ? "s" : ""}
              {stats.activeReaderCount > 0 && ` · ${stats.activeReaderCount} reading now`}
            </span>
          )}
        </div>

        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, lineHeight: 1.3, marginBottom: "0.75rem" }}>
          {topic.title}
        </h1>

        {/* Discussion prompt */}
        <div style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderLeft: "4px solid var(--accent)",
          borderRadius: "0 6px 6px 0",
          padding: "0.875rem 1rem",
        }}>
          <p style={{ fontSize: "0.95rem", fontStyle: "italic", color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
            {topic.discussion_prompt}
          </p>
        </div>
      </div>

      {/* Framing note */}
      {topic.framing_note && (
        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "1rem" }}>
            Framing
          </h2>
          <FramingSection text={topic.framing_note} />
        </section>
      )}

      {/* From the author — video embeds */}
      <VideosSection videos={(topic.videos ?? []) as { youtube_id: string; title: string; speaker: string; duration_min?: number; note?: string }[]} />

      {/* Real-world anchor */}
      {anchor?.title && anchor?.body && (
        <section style={{ marginBottom: "2rem" }}>
          <RealWorldAnchor
            title={anchor.title}
            body={anchor.body}
            source_url={anchor.source_url}
          />
        </section>
      )}

      {/* Concepts */}
      {concepts && concepts.length > 0 && (
        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
            Key concepts
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {(concepts as unknown as { id: string; term: string; slug: string }[]).map((c) => (
              <ConceptChip key={c.id} term={c.term} slug={c.slug} />
            ))}
          </div>
        </section>
      )}

      {/* Papers */}
      {papers && papers.length > 0 && (
        <section style={{ marginBottom: "2rem" }}>
          <PapersSection papers={papers as Parameters<typeof PapersSection>[0]["papers"]} />
        </section>
      )}

      {/* Discussion CTA */}
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "1.5rem",
        textAlign: "center",
        marginTop: "1rem",
      }}>
        <p style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "0.4rem" }}>
          Join the discussion
        </p>
        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
          Share your analysis, build on others' arguments, and take the comprehension quiz to unlock AI Q&A.
        </p>
        <Link
          href={`/topics/${topic.slug}/discuss`}
          className="btn btn-primary"
          style={{ textDecoration: "none", display: "inline-block" }}
        >
          Go to discussion
        </Link>
      </div>
    </div>
  );
}
