"use client";

import Link from "next/link";
import { useT } from "@/i18n/LocaleProvider";

export default function UpgradeSuccessPage() {
  const t = useT();
  return (
    <div className="page-narrow" style={{ textAlign: "center", paddingTop: "5rem" }}>
      <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>✦</div>
      <h1 style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: "0.5rem" }}>{t("upgrade.success.title")}</h1>
      <p style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.65, maxWidth: 420, margin: "0 auto 2rem" }}>
        {t("upgrade.success.prose.body")}
      </p>
      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
        <Link href="/topics" className="btn btn-primary" style={{ textDecoration: "none" }}>
          {t("upgrade.success.cta.exploreTopics")}
        </Link>
        <Link href="/profile" className="btn" style={{ textDecoration: "none" }}>
          {t("upgrade.success.cta.viewProfile")}
        </Link>
      </div>
    </div>
  );
}
