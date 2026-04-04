"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

export default function StanceTagsPage() {
  const { data: topics } = trpc.topics.adminList.useQuery();
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");

  const { data: tags, isLoading: tagsLoading, refetch: refetchTags } = trpc.admin.stanceTagsForTopic.useQuery(
    { topicId: selectedTopicId },
    { enabled: !!selectedTopicId },
  );

  const merge = trpc.admin.mergeStanceTags.useMutation({ onSuccess: () => refetchTags() });

  const [deprecated, setDeprecated] = useState("");
  const [canonical, setCanonical] = useState("");
  const [mergeError, setMergeError] = useState("");

  function handleMerge(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTopicId) return;
    setMergeError("");
    merge.mutate(
      { deprecated, canonical, topicId: selectedTopicId },
      {
        onSuccess: () => { setDeprecated(""); setCanonical(""); },
        onError: (e) => setMergeError(e.message),
      },
    );
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "1.5rem" }}>Stance tags</h1>

      <div className="form-group">
        <label className="form-label">Select topic</label>
        <select
          className="form-select"
          value={selectedTopicId}
          onChange={(e) => { setSelectedTopicId(e.target.value); setDeprecated(""); setCanonical(""); }}
        >
          <option value="">— pick a topic —</option>
          {(topics ?? []).map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      </div>

      {selectedTopicId && (
        <>
          <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
            <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.75rem" }}>
              Tags in use
            </p>
            {tagsLoading ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading…</p>
            ) : !tags?.length ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No stance tags on this topic yet.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {tags.map(({ tag, count }) => (
                  <button
                    key={tag}
                    type="button"
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 20,
                      padding: "0.25rem 0.75rem",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      color: "var(--text-primary)",
                    }}
                    onClick={() => setDeprecated(tag)}
                    title="Click to set as the tag to replace"
                  >
                    {tag} <span style={{ color: "var(--text-muted)" }}>({count})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "1.25rem" }}>
            <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "1rem" }}>
              Merge tags
            </p>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
              Rename or merge a variant tag into a canonical one. All contributions using the variant will be updated.
              The match is case-insensitive.
            </p>
            <form onSubmit={handleMerge}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0.75rem", alignItems: "end" }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Replace tag</label>
                  <input
                    className="form-input"
                    value={deprecated}
                    onChange={(e) => setDeprecated(e.target.value)}
                    placeholder="responsibilty-gap"
                    required
                  />
                </div>
                <span style={{ fontSize: "1rem", color: "var(--text-muted)", paddingBottom: "0.1rem" }}>→</span>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">With canonical tag</label>
                  <input
                    className="form-input"
                    value={canonical}
                    onChange={(e) => setCanonical(e.target.value)}
                    placeholder="responsibility-gap"
                    required
                  />
                </div>
              </div>

              {mergeError && <p style={{ color: "#c44", fontSize: "0.85rem", marginTop: "0.5rem" }}>{mergeError}</p>}

              <div style={{ marginTop: "1rem" }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={merge.isPending || !deprecated.trim() || !canonical.trim()}
                >
                  {merge.isPending ? "Merging…" : "Merge tags"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
