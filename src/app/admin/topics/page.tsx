"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

const STATUS_COLOR: Record<string, string> = {
  published: "#2a7a3b",
  draft: "#8a8f9c",
  archived: "#c44",
};

export default function AdminTopicsPage() {
  const { data: topics, isLoading, refetch } = trpc.topics.adminList.useQuery();
  const archive = trpc.topics.archive.useMutation({ onSuccess: () => refetch() });
  const publish = trpc.topics.publish.useMutation({ onSuccess: () => refetch() });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700 }}>Topics</h1>
        <Link href="/admin/topics/new" className="btn btn-primary">+ New topic</Link>
      </div>

      {isLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : !topics?.length ? (
        <p style={{ color: "var(--text-muted)" }}>No topics yet. <Link href="/admin/topics/new" style={{ color: "var(--accent)" }}>Create the first one.</Link></p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <th style={{ textAlign: "left", padding: "0.5rem 0.75rem 0.5rem 0" }}>Title</th>
              <th style={{ textAlign: "left", padding: "0.5rem 0.75rem" }}>Status</th>
              <th style={{ textAlign: "left", padding: "0.5rem 0.75rem" }}>Difficulty</th>
              <th style={{ textAlign: "left", padding: "0.5rem 0.75rem" }}>Seq</th>
              <th style={{ textAlign: "right", padding: "0.5rem 0 0.5rem 0.75rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                <td style={{ padding: "0.75rem 0.75rem 0.75rem 0" }}>
                  <Link href={`/admin/topics/${t.id}`} style={{ color: "var(--text-primary)", fontWeight: 500, textDecoration: "none", fontSize: "0.9rem" }}>
                    {t.title}
                  </Link>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>{t.slug}</div>
                </td>
                <td style={{ padding: "0.75rem" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: STATUS_COLOR[t.status] ?? "var(--text-muted)" }}>
                    {t.status}
                  </span>
                </td>
                <td style={{ padding: "0.75rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{t.difficulty}</td>
                <td style={{ padding: "0.75rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.sequence_number ?? "—"}</td>
                <td style={{ padding: "0.75rem 0 0.75rem 0.75rem", textAlign: "right" }}>
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                    <Link href={`/admin/topics/${t.id}`} className="btn" style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}>Edit</Link>
                    {t.status === "draft" && (
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
                        onClick={() => publish.mutate({ id: t.id })}
                        disabled={publish.isPending}
                      >
                        Publish
                      </button>
                    )}
                    {t.status === "published" && (
                      <button
                        className="btn"
                        style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem", color: "#c44", borderColor: "#c44" }}
                        onClick={() => { if (confirm("Archive this topic?")) archive.mutate({ id: t.id }); }}
                        disabled={archive.isPending}
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
