"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import BuildOnModal from "./BuildOnModal";

const REACTION_LABELS: Record<string, { label: string; emoji: string }> = {
  great_point: { label: "Great point", emoji: "✦" },
  interesting: { label: "Interesting", emoji: "◈" },
  i_disagree: { label: "I disagree", emoji: "↔" },
  thumbs_up: { label: "👍", emoji: "👍" },
};

const REACTION_PRESETS = ["great_point", "interesting", "i_disagree", "thumbs_up"] as const;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface Reply {
  id: string;
  user_id: string;
  relationship_type: string | null;
  body: string | null;
  reaction_type: string | null;
  created_at: string;
  actor?: { id: string; display_name: string } | null;
}

interface ContributionCardProps {
  id: string;
  user_id: string;
  topicId: string;
  body: string;
  stance_tag: string | null;
  created_at: string;
  author: { id: string; display_name: string } | null;
  replies: Reply[];
  currentUserId: string | null;
  onMutated: () => void;
}

export default function ContributionCard({
  id,
  user_id,
  topicId,
  body,
  stance_tag,
  created_at,
  author,
  replies,
  currentUserId,
  onMutated,
}: ContributionCardProps) {
  const [buildOnOpen, setBuildOnOpen] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(body);
  const [editStance, setEditStance] = useState(stance_tag ?? "");

  const isOwn = currentUserId === user_id;

  const react = trpc.contributions.create.useMutation({ onSuccess: () => onMutated() });
  const deleteC = trpc.contributions.delete.useMutation({ onSuccess: () => onMutated() });
  const updateC = trpc.contributions.update.useMutation({
    onSuccess: () => { setEditing(false); onMutated(); },
  });
  const flagC = trpc.contributions.flag.useMutation();

  // Aggregate preset reactions
  const presetReplies = replies.filter((r) => r.relationship_type === "reply");
  const reactionCounts = presetReplies.reduce<Record<string, number>>((acc, r) => {
    if (r.reaction_type) acc[r.reaction_type] = (acc[r.reaction_type] ?? 0) + 1;
    return acc;
  }, {});

  // Build-on replies (have body text)
  const buildOns = replies.filter((r) => r.relationship_type === "build_on");

  const hasAlreadyReacted = presetReplies.some((r) => r.user_id === currentUserId);

  return (
    <>
      <div className="contribution-card">
        {/* Header */}
        <div className="contribution-header">
          <span className="contribution-author">
            {author?.display_name ?? "Anonymous"}
          </span>
          <span>·</span>
          <span>{timeAgo(created_at)}</span>
          {stance_tag && (
            <>
              <span>·</span>
              <span className="stance-tag">{stance_tag}</span>
            </>
          )}
        </div>

        {/* Body */}
        {editing ? (
          <div style={{ marginBottom: "0.75rem" }}>
            <textarea
              className="form-textarea"
              value={editBody}
              onChange={(e) => setEditBody(e.target.value.slice(0, 2000))}
              style={{ minHeight: 100, marginBottom: "0.5rem", fontSize: "0.9rem" }}
              autoFocus
            />
            <input
              className="form-input"
              value={editStance}
              onChange={(e) => setEditStance(e.target.value)}
              placeholder="Stance tag (optional)"
              style={{ marginBottom: "0.5rem", fontSize: "0.85rem" }}
            />
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: "0.8rem" }}
                disabled={updateC.isPending}
                onClick={() => updateC.mutate({ id, body: editBody, stance_tag: editStance || null })}
              >
                {updateC.isPending ? "Saving…" : "Save"}
              </button>
              <button type="button" className="btn" style={{ fontSize: "0.8rem" }} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="contribution-body">{body}</p>
        )}

        {/* Reaction summary */}
        {Object.keys(reactionCounts).length > 0 && !editing && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
            {Object.entries(reactionCounts).map(([type, count]) => (
              <span
                key={type}
                style={{
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: 12,
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-secondary)",
                }}
              >
                {REACTION_LABELS[type]?.emoji ?? type} {count}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        {!editing && (
          <div className="contribution-actions">
            {currentUserId && !isOwn && (
              <>
                <button
                  type="button"
                  className="contribution-action-btn"
                  onClick={() => setBuildOnOpen(true)}
                >
                  Build on →
                </button>
                {!hasAlreadyReacted && (
                  <button
                    type="button"
                    className="contribution-action-btn"
                    onClick={() => setShowReactions((v) => !v)}
                  >
                    React
                  </button>
                )}
                <button
                  type="button"
                  className="contribution-action-btn"
                  onClick={() => flagC.mutate({ id })}
                  title="Flag for moderation"
                >
                  Flag
                </button>
              </>
            )}
            {isOwn && (
              <>
                <button
                  type="button"
                  className="contribution-action-btn"
                  onClick={() => setEditing(true)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="contribution-action-btn"
                  style={{ color: "#c44" }}
                  onClick={() => { if (confirm("Delete this contribution?")) deleteC.mutate({ id }); }}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        )}

        {/* Reaction picker */}
        {showReactions && (
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
            {REACTION_PRESETS.map((type) => (
              <button
                key={type}
                type="button"
                style={{
                  fontSize: "0.78rem",
                  padding: "3px 10px",
                  borderRadius: 14,
                  border: "1px solid var(--border)",
                  background: "var(--bg-secondary)",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                }}
                disabled={react.isPending}
                onClick={() => {
                  react.mutate({
                    topic_id: topicId,
                    relationship_type: "reply",
                    parent_id: id,
                    reaction_type: type,
                  });
                  setShowReactions(false);
                }}
              >
                {REACTION_LABELS[type]?.emoji} {REACTION_LABELS[type]?.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Build-on sub-cards */}
      {buildOns.length > 0 && (
        <div style={{ marginLeft: "1.5rem", marginTop: "-0.25rem", borderLeft: "2px solid var(--border-light)", paddingLeft: "0.75rem" }}>
          {buildOns.map((bo) => (
            <div
              key={bo.id}
              className="contribution-card"
              style={{ marginBottom: "0.5rem", background: "var(--bg-secondary)" }}
            >
              <div className="contribution-header">
                <span className="contribution-author">
                  {bo.actor?.display_name ?? "Anonymous"}
                </span>
                <span>·</span>
                <span>{timeAgo(bo.created_at)}</span>
                <span style={{ fontSize: "0.68rem", color: "var(--accent)", marginLeft: "0.25rem" }}>
                  builds on
                </span>
              </div>
              <p className="contribution-body">{bo.body}</p>
            </div>
          ))}
        </div>
      )}

      {buildOnOpen && (
        <BuildOnModal
          topicId={topicId}
          parentId={id}
          parentAuthor={author?.display_name ?? "Anonymous"}
          parentBody={body}
          onClose={() => setBuildOnOpen(false)}
          onSuccess={onMutated}
        />
      )}
    </>
  );
}
