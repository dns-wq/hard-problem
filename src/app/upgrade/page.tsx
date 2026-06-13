"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n/LocaleProvider";

const FREE_FEATURE_KEYS = [
  "upgrade.feature.free.allTopics",
  "upgrade.feature.free.readPapers",
  "upgrade.feature.free.discussion",
  "upgrade.feature.free.buildOn",
  "upgrade.feature.free.quiz",
];

const PRO_FEATURE_KEYS = [
  "upgrade.feature.pro.everythingInFree",
  "upgrade.feature.pro.aiQa",
  "upgrade.feature.pro.socratic",
  "upgrade.feature.pro.history",
  "upgrade.feature.pro.priority",
];

export default function UpgradePage() {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpgrade() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          window.location.href = "/auth/login?next=/upgrade";
          return;
        }
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("upgrade.error.generic"));
      setLoading(false);
    }
  }

  return (
    <div className="page-narrow" style={{ paddingTop: "3rem" }}>
      <div style={{ textAlign: "center", marginBottom: "3rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, marginBottom: "0.5rem" }}>
          {t("upgrade.title")}
        </h1>
        <p style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.65, maxWidth: 460, margin: "0 auto" }}>
          {t("upgrade.prose.subtitle")}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", maxWidth: 620, margin: "0 auto" }}>
        {/* Free */}
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.5rem" }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
            {t("upgrade.plan.free")}
          </p>
          <p style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: "1.25rem" }}>{t("upgrade.plan.freePrice")}</p>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {FREE_FEATURE_KEYS.map((key) => (
              <li key={key} style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                <span style={{ color: "var(--success)", flexShrink: 0, marginTop: "0.05rem" }}>✓</span>
                {t(key)}
              </li>
            ))}
          </ul>
          <Link href="/topics" className="btn" style={{ display: "block", textAlign: "center", textDecoration: "none", width: "100%" }}>
            {t("upgrade.cta.getStarted")}
          </Link>
        </div>

        {/* Pro */}
        <div style={{ background: "var(--bg-surface)", border: "2px solid var(--accent)", borderRadius: 10, padding: "1.5rem", position: "relative" }}>
          <span style={{
            position: "absolute",
            top: "-11px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--accent)",
            color: "white",
            fontSize: "0.68rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            padding: "2px 10px",
            borderRadius: 10,
            whiteSpace: "nowrap",
          }}>
            {t("upgrade.plan.mostPopular")}
          </span>
          <p style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent)", marginBottom: "0.5rem" }}>
            {t("upgrade.plan.pro")}
          </p>
          <div style={{ marginBottom: "1.25rem" }}>
            <span style={{ fontSize: "1.6rem", fontWeight: 800 }}>{t("upgrade.plan.proPrice")}</span>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t("upgrade.plan.proPriceSuffix")}</span>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {PRO_FEATURE_KEYS.map((key) => (
              <li key={key} style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                <span style={{ color: "var(--accent)", flexShrink: 0, marginTop: "0.05rem" }}>✓</span>
                {t(key)}
              </li>
            ))}
          </ul>
          {error && <p style={{ fontSize: "0.78rem", color: "var(--danger)", marginBottom: "0.5rem" }}>{error}</p>}
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%", fontSize: "0.9rem", padding: "0.55rem" }}
            onClick={handleUpgrade}
            disabled={loading}
          >
            {loading ? t("upgrade.cta.upgradeLoading") : t("upgrade.cta.upgrade")}
          </button>
        </div>
      </div>

      <p style={{ textAlign: "center", fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "1.5rem" }}>
        {t("upgrade.prose.cancelAnytime")}
      </p>
    </div>
  );
}
