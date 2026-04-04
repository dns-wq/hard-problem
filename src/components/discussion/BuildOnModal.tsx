"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

interface BuildOnModalProps {
  topicId: string;
  parentId: string;
  parentAuthor: string;
  parentBody: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BuildOnModal({ topicId, parentId, parentAuthor, parentBody, onClose, onSuccess }: BuildOnModalProps) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const MAX = 2000;

  const create = trpc.contributions.create.useMutation({
    onSuccess: () => { setBody(""); onSuccess(); onClose(); },
    onError: (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setError("");
    create.mutate({
      topic_id: topicId,
      relationship_type: "build_on",
      parent_id: parentId,
      body: body.trim(),
    });
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <h2 className="modal-title">Build on this argument</h2>

        {/* Quoted parent */}
        <div style={{
          borderLeft: "3px solid var(--border)",
          paddingLeft: "0.75rem",
          marginBottom: "1rem",
          color: "var(--text-secondary)",
          fontSize: "0.85rem",
          lineHeight: 1.55,
        }}>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>
            {parentAuthor}
          </span>
          {parentBody.length > 200 ? parentBody.slice(0, 200) + "…" : parentBody}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ position: "relative", marginBottom: "0.75rem" }}>
            <textarea
              className="form-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX))}
              placeholder="Extend, challenge, or synthesize this argument with your own analysis…"
              style={{ minHeight: 140, resize: "vertical" }}
              autoFocus
            />
            <span style={{
              position: "absolute",
              bottom: "0.5rem",
              right: "0.6rem",
              fontSize: "0.7rem",
              color: body.length > MAX * 0.9 ? "#c44" : "var(--text-muted)",
            }}>
              {body.length}/{MAX}
            </span>
          </div>

          {error && <p style={{ color: "#c44", fontSize: "0.82rem", marginBottom: "0.75rem" }}>{error}</p>}

          <div className="modal-actions">
            <button type="button" className="modal-btn" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="modal-btn modal-btn-primary"
              disabled={!body.trim() || create.isPending}
            >
              {create.isPending ? "Posting…" : "Post build-on"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
