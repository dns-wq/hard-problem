"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

export default function SettingsPage() {
  const router = useRouter();
  const { data: profile, isLoading } = trpc.profile.me.useQuery();
  const update = trpc.profile.update.useMutation({
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); },
    onError: (e) => setError(e.message),
  });

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setBio(profile.bio ?? "");
    }
  }, [profile]);

  if (isLoading) return <div className="page-narrow"><p style={{ color: "var(--text-muted)" }}>Loading…</p></div>;
  if (!profile) {
    router.push("/auth/login");
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    update.mutate({
      display_name: displayName.trim() || undefined,
      bio: bio.trim() || null,
    });
  }

  return (
    <div className="page-narrow">
      <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "2rem" }}>Settings</h1>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "1rem" }}>
          Profile
        </h2>
        <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
          <div className="form-group">
            <label className="form-label">Display name</label>
            <input
              className="form-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              maxLength={80}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Bio <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none" }}>— optional, max 500 chars</span></label>
            <textarea
              className="form-textarea"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 500))}
              placeholder="Tell us about your background or interest in tech ethics…"
              style={{ minHeight: 80 }}
            />
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{bio.length}/500</span>
          </div>

          {error && <p style={{ color: "#c44", fontSize: "0.85rem", marginBottom: "0.75rem" }}>{error}</p>}

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button type="submit" className="btn btn-primary" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save changes"}
            </button>
            {saved && <span style={{ fontSize: "0.82rem", color: "#2a7a3b" }}>Saved.</span>}
          </div>
        </form>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
          Account
        </h2>
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: 8, padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.1rem" }}>Subscription</p>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {profile.subscription_tier === "pro" ? "Pro — AI Q&A enabled" : "Free plan"}
              </p>
            </div>
            {profile.subscription_tier === "pro" ? (
              <ManageBillingButton />
            ) : (
              <Link href="/upgrade" className="btn btn-primary" style={{ textDecoration: "none", fontSize: "0.82rem" }}>
                Upgrade to Pro
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ManageBillingButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const res = await fetch("/api/stripe/checkout", { method: "GET" });
    const { url } = await res.json();
    window.location.href = url;
  }

  return (
    <button
      type="button"
      className="btn"
      style={{ fontSize: "0.82rem" }}
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? "Opening…" : "Manage subscription"}
    </button>
  );
}
