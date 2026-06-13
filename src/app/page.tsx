"use client";

import Link from "next/link";
import { useT } from "@/i18n/LocaleProvider";

const STEPS = ["01", "02", "03", "04"] as const;

export default function HomePage() {
  const t = useT();
  return (
    <div>
      {/* Hero */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "5rem 1.5rem 3rem" }}>
        <p style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent)", marginBottom: "1rem" }}>
          {t("home.hero.eyebrow")}
        </p>
        <h1 style={{ fontSize: "2.4rem", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.025em", marginBottom: "1.25rem" }}>
          {t("home.hero.title")}
        </h1>
        <p style={{ fontSize: "1.05rem", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 520, marginBottom: "2rem" }}>
          {t("home.hero.subtitle")}
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link href="/topics" className="btn btn-primary" style={{ fontSize: "0.95rem", padding: "0.6rem 1.6rem", textDecoration: "none" }}>
            {t("home.hero.ctaTopics")}
          </Link>
          <Link href="/about" className="btn" style={{ fontSize: "0.95rem", padding: "0.6rem 1.6rem", textDecoration: "none" }}>
            {t("home.hero.ctaAbout")}
          </Link>
        </div>
      </div>

      {/* How it works */}
      <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)", padding: "3rem 1.5rem" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "2rem", textAlign: "center" }}>
            {t("home.howItWorks.heading")}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
            {STEPS.map((n) => (
              <div key={n}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent)", display: "block", marginBottom: "0.5rem", fontVariantNumeric: "tabular-nums" }}>
                  {n}
                </span>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.4rem" }}>{t(`home.steps.${n}.title`)}</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{t(`home.steps.${n}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Designed for STEM */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          {t("home.stem.heading")}
        </h2>
        <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 560, marginBottom: "1.5rem" }}>
          {t("home.stem.body")}
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link href="/topics" className="btn btn-primary" style={{ textDecoration: "none" }}>
            {t("home.stem.ctaStart")}
          </Link>
          <Link href="/upgrade" className="btn" style={{ textDecoration: "none" }}>
            {t("home.stem.ctaPro")}
          </Link>
        </div>
      </div>
    </div>
  );
}
