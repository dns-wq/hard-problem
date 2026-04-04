"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

export default function PublicProfilePage() {
  const params = useParams<{ displayName: string }>();
  const displayName = decodeURIComponent(params.displayName);

  const { data, isLoading, error } = trpc.profile.publicProfile.useQuery({ displayName });

  if (isLoading) {
    return <div className="page-narrow"><p style={{ color: "var(--text-muted)" }}>Loading…</p></div>;
  }

  if (error || !data) {
    return (
      <div className="page-narrow" style={{ textAlign: "center", paddingTop: "4rem" }}>
        <p style={{ color: "var(--text-muted)" }}>Profile not found.</p>
        <Link href="/topics" className="btn" style={{ marginTop: "1rem", display: "inline-block", textDecoration: "none" }}>
          ← Topics
        </Link>
      </div>
    );
  }

  const { user, contributions } = data;

  return (
    <div className="page-narrow">
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.2rem" }}>
          {user.display_name}
        </h1>
        {user.bio && (
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: 460 }}>
            {user.bio}
          </p>
        )}
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
          Member since {new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </p>
      </div>

      {contributions.length > 0 && (
        <section>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
            Contributions
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {contributions.map((c) => {
              const topic = c.topic as unknown as { id: string; title: string; slug: string } | null;
              return (
                <div key={c.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: 6, padding: "0.875rem 1rem" }}>
                  {topic && (
                    <div style={{ fontSize: "0.72rem", marginBottom: "0.3rem" }}>
                      <Link href={`/topics/${topic.slug}/discuss`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                        {topic.title} →
                      </Link>
                    </div>
                  )}
                  <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.55, margin: 0 }}>
                    {c.body && c.body.length > 200 ? c.body.slice(0, 200) + "…" : c.body}
                  </p>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.4rem" }}>
                    {c.stance_tag && <span className="stance-tag">{c.stance_tag}</span>}
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
