"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

export default function AdminDashboard() {
  const { data: stats, isLoading } = trpc.admin.stats.useQuery();

  return (
    <div>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "1.5rem" }}>Dashboard</h1>

      {isLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
          <StatCard label="Published topics" value={stats?.topics.published ?? 0} href="/admin/topics" />
          <StatCard label="Draft topics" value={stats?.topics.draft ?? 0} href="/admin/topics" />
          <StatCard label="Archived topics" value={stats?.topics.archived ?? 0} href="/admin/topics" />
          <StatCard label="Flagged contributions" value={stats?.flaggedContributions ?? 0} href="/admin/moderation" warn={(stats?.flaggedContributions ?? 0) > 0} />
        </div>
      )}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Link href="/admin/topics/new" className="btn btn-primary">+ New topic</Link>
        <Link href="/admin/concepts" className="btn">Manage concepts</Link>
        <Link href="/admin/moderation" className="btn">Review flags</Link>
      </div>
    </div>
  );
}

function StatCard({ label, value, href, warn }: { label: string; value: number; href: string; warn?: boolean }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        background: "var(--bg-surface)",
        border: `1px solid ${warn && value > 0 ? "#e04040" : "var(--border-light)"}`,
        borderRadius: 8,
        padding: "1rem 1.25rem",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}>
        <div style={{ fontSize: "1.75rem", fontWeight: 700, color: warn && value > 0 ? "#e04040" : "var(--accent)" }}>
          {value}
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>{label}</div>
      </div>
    </Link>
  );
}
