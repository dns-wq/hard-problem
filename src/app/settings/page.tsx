"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useT } from "@/i18n/LocaleProvider";

export default function SettingsPage() {
  const t = useT();
  const router = useRouter();
  const { data: profile, isLoading } = trpc.profile.me.useQuery();
  const update = trpc.profile.update.useMutation({
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); },
    onError: (e) => setError(e.message),
  });

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [transcriptPublic, setTranscriptPublic] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setBio(profile.bio ?? "");
      setTranscriptPublic(!!profile.live_transcript_public);
    }
  }, [profile]);

  if (isLoading) return <div className="page-narrow"><p style={{ color: "var(--text-muted)" }}>{t("common.loading")}</p></div>;
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
      live_transcript_public: transcriptPublic,
    });
  }

  return (
    <div className="page-narrow">
      <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "2rem" }}>{t("settings.title")}</h1>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "1rem" }}>
          {t("settings.section.profile")}
        </h2>
        <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
          <div className="form-group">
            <label className="form-label">{t("settings.label.displayName")}</label>
            <input
              className="form-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("settings.placeholder.displayName")}
              maxLength={80}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t("settings.label.bio")} <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none" }}>{t("settings.hint.bio")}</span></label>
            <textarea
              className="form-textarea"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 500))}
              placeholder={t("settings.placeholder.bio")}
              style={{ minHeight: 80 }}
            />
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{t("settings.hint.bioCount", { count: bio.length })}</span>
          </div>

          <div className="form-group">
            <label style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={transcriptPublic}
                onChange={(e) => setTranscriptPublic(e.target.checked)}
                style={{ marginTop: "0.2rem" }}
              />
              <span>
                <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{t("settings.label.publishTranscript")}</span>
                <span style={{ display: "block", fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                  {t("settings.desc.publishTranscript")}
                </span>
              </span>
            </label>
          </div>

          {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>{error}</p>}

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button type="submit" className="btn btn-primary" disabled={update.isPending}>
              {update.isPending ? t("settings.cta.saveLoading") : t("settings.cta.save")}
            </button>
            {saved && <span style={{ fontSize: "0.82rem", color: "var(--success)" }}>{t("settings.status.saved")}</span>}
          </div>
        </form>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
          {t("settings.section.account")}
        </h2>
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: 8, padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.1rem" }}>{t("settings.account.subscription")}</p>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {profile.subscription_tier === "pro" ? t("settings.account.tier.pro") : t("settings.account.tier.free")}
              </p>
            </div>
            {profile.subscription_tier === "pro" ? (
              <ManageBillingButton />
            ) : (
              <Link href="/upgrade" className="btn btn-primary" style={{ textDecoration: "none", fontSize: "0.82rem" }}>
                {t("settings.cta.upgradeToPro")}
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ManageBillingButton() {
  const t = useT();
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
      {loading ? t("settings.cta.manageBillingLoading") : t("settings.cta.manageBilling")}
    </button>
  );
}
