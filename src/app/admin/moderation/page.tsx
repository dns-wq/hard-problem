"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

export default function ModerationPage() {
  const { data: items, isLoading, refetch } = trpc.admin.flaggedContributions.useQuery();
  const dismiss = trpc.admin.dismissFlag.useMutation({ onSuccess: () => refetch() });
  const remove = trpc.admin.removeContribution.useMutation({ onSuccess: () => refetch() });

  return (
    <div>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "1.5rem" }}>Moderation queue</h1>

      {isLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : !items?.length ? (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: 8, padding: "2rem", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No flagged contributions. Queue is clear.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {items.map((item) => (
            <div key={item.id} style={{ background: "var(--bg-surface)", border: "1px solid #e04040", borderRadius: 8, padding: "1rem 1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#c44", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 4, padding: "0.1rem 0.4rem" }}>
                      flagged
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {item.relationship_type}
                    </span>
                    {item.stance_tag && (
                      <span style={{ fontSize: "0.75rem", background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 4, padding: "0.1rem 0.4rem" }}>
                        {item.stance_tag}
                      </span>
                    )}
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      by <strong>{(item.author as { display_name?: string } | null)?.display_name ?? "Unknown"}</strong>
                    </span>
                    {item.topic && (
                      <Link
                        href={`/topics/${(item.topic as { slug?: string }).slug ?? ""}`}
                        style={{ fontSize: "0.75rem", color: "var(--accent)", textDecoration: "none" }}
                        target="_blank"
                      >
                        {(item.topic as { title?: string }).title}
                      </Link>
                    )}
                  </div>

                  {item.body ? (
                    <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "var(--text-primary)", margin: 0, whiteSpace: "pre-wrap" }}>
                      {item.body}
                    </p>
                  ) : item.reaction_type ? (
                    <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0, fontStyle: "italic" }}>
                      Reaction: {item.reaction_type}
                    </p>
                  ) : null}

                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flexShrink: 0 }}>
                  <button
                    className="btn"
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
                    onClick={() => dismiss.mutate({ id: item.id })}
                    disabled={dismiss.isPending}
                    title="Keep the contribution but clear the flag"
                  >
                    Dismiss flag
                  </button>
                  <button
                    className="btn"
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem", color: "#c44", borderColor: "#c44" }}
                    onClick={() => { if (confirm("Remove this contribution? The author will be notified.")) remove.mutate({ id: item.id }); }}
                    disabled={remove.isPending}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
