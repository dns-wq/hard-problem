"use client";

import ContributionCard from "./ContributionCard";

type Reply = {
  id: string;
  user_id: string;
  relationship_type: string | null;
  body: string | null;
  reaction_type: string | null;
  created_at: string;
  actor?: { id: string; display_name: string } | null;
};

type Contribution = {
  id: string;
  user_id: string;
  body: string;
  stance_tag: string | null;
  created_at: string;
  author: { id: string; display_name: string } | null;
  replies: Reply[];
};

interface ContributionListProps {
  contributions: Contribution[];
  topicId: string;
  currentUserId: string | null;
  isLoading: boolean;
  onMutated: () => void;
}

export default function ContributionList({
  contributions,
  topicId,
  currentUserId,
  isLoading,
  onMutated,
}: ContributionListProps) {
  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            style={{
              height: 100,
              background: "var(--bg-surface)",
              border: "1px solid var(--border-light)",
              borderRadius: 6,
              opacity: 0.4 + i * 0.1,
            }}
          />
        ))}
      </div>
    );
  }

  if (!contributions.length) {
    return (
      <div style={{
        textAlign: "center",
        padding: "3rem 0",
        color: "var(--text-muted)",
        fontSize: "0.9rem",
      }}>
        <p style={{ marginBottom: "0.4rem" }}>No contributions yet.</p>
        <p style={{ fontSize: "0.82rem" }}>Be the first to share your analysis.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {contributions.map((c) => (
        <ContributionCard
          key={c.id}
          id={c.id}
          user_id={c.user_id}
          topicId={topicId}
          body={c.body}
          stance_tag={c.stance_tag}
          created_at={c.created_at}
          author={c.author}
          replies={c.replies}
          currentUserId={currentUserId}
          onMutated={onMutated}
        />
      ))}
    </div>
  );
}
