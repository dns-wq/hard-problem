"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useT } from "@/i18n/LocaleProvider";

interface ComposerProps {
  topicId: string;
  discussionPrompt: string;
  currentUserId: string | null;
  onSuccess: () => void;
}

export default function Composer({ topicId, discussionPrompt, currentUserId, onSuccess }: ComposerProps) {
  const t = useT();
  const [body, setBody] = useState("");
  const [stanceTag, setStanceTag] = useState("");
  const [error, setError] = useState("");
  const MAX = 2000;

  const create = trpc.contributions.create.useMutation({
    onSuccess: () => { setBody(""); setStanceTag(""); setError(""); onSuccess(); },
    onError: (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setError("");
    create.mutate({
      topic_id: topicId,
      relationship_type: null,
      body: body.trim(),
      stance_tag: stanceTag.trim() || null,
    });
  }

  if (!currentUserId) {
    const tpl = t("discuss.signedOut.joinPrompt");
    const [a, rest] = tpl.split("{signIn}");
    const [b, c] = rest.split("{createAccount}");
    return (
      <div style={{
        border: "1px dashed var(--border)",
        borderRadius: 8,
        padding: "1.25rem",
        textAlign: "center",
        marginBottom: "1.5rem",
      }}>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
          {a}
          <Link href="/auth/login" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
            {t("nav.signIn")}
          </Link>
          {b}
          <Link href="/auth/signup" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
            {t("discuss.signedOut.createAccount")}
          </Link>
          {c}
        </p>
      </div>
    );
  }

  return (
    <div className="composer" style={{ marginBottom: "1.5rem" }}>
      <form onSubmit={handleSubmit}>
        <textarea
          className="composer-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX))}
          placeholder={discussionPrompt}
        />
        <div className="composer-footer">
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              value={stanceTag}
              onChange={(e) => setStanceTag(e.target.value.slice(0, 100))}
              placeholder={t("discuss.composer.stancePlaceholder")}
              style={{
                fontSize: "0.8rem",
                padding: "0.3rem 0.6rem",
                border: "1px solid var(--border)",
                borderRadius: 4,
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                outline: "none",
                width: 180,
              }}
            />
            {error && <span style={{ fontSize: "0.78rem", color: "var(--danger)" }}>{error}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "0.72rem", color: body.length > MAX * 0.9 ? "var(--danger)" : "var(--text-muted)" }}>
              {body.length}/{MAX}
            </span>
            <button
              type="submit"
              className="composer-submit"
              disabled={!body.trim() || create.isPending}
            >
              {create.isPending ? t("discuss.cta.posting") : t("discuss.cta.post")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
