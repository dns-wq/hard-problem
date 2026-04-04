"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import ProgressIndicator from "@/components/topic/ProgressIndicator";

export default function ProfilePage() {
  const { data: profile, isLoading } = trpc.profile.me.useQuery();
  const { data: stats } = trpc.profile.stats.useQuery();
  const { data: myContributions } = trpc.profile.myContributions.useQuery({ limit: 10 });

  if (isLoading) {
    return (
      <div className="page-narrow">
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-narrow" style={{ textAlign: "center", paddingTop: "4rem" }}>
        <p style={{ color: "var(--text-muted)" }}>Not signed in.</p>
        <Link href="/auth/login" className="btn btn-primary" style={{ marginTop: "1rem", display: "inline-block", textDecoration: "none" }}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="page-narrow">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.2rem" }}>
            {profile.display_name}
          </h1>
          {profile.bio && (
            <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.55, maxWidth: 420 }}>
              {profile.bio}
            </p>
          )}
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
            {profile.subscription_tier === "pro"
              ? "Pro member"
              : "Free plan"}{" "}
            · Member since {new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        </div>
        <Link href="/settings" className="btn" style={{ textDecoration: "none", fontSize: "0.82rem" }}>
          Edit profile
        </Link>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "2rem" }}>
          {[
            { label: "Topics engaged", value: stats.topicsEngaged },
            { label: "Contributions", value: stats.totalContributions },
            { label: "Times built on", value: stats.totalBuiltUpon },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: 8, padding: "0.875rem 1rem" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>{value}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Topic progress */}
      {stats?.progress && stats.progress.length > 0 && (
        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
            Progress
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {stats.progress.map((p) => (
              <div key={p.topic_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: 6, padding: "0.6rem 0.875rem" }}>
                <Link href={`/topics`} style={{ fontSize: "0.85rem", color: "var(--text-primary)", textDecoration: "none" }}>
                  Topic
                </Link>
                <ProgressIndicator quizPassed={p.quiz_passed ?? false} hasContributed={p.contributed ?? false} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent contributions */}
      {myContributions && myContributions.length > 0 && (
        <section>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
            Recent contributions
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {myContributions.map((c) => {
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
