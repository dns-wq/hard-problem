"use client";

import { useT } from "@/i18n/LocaleProvider";

export default function AboutPage() {
  const t = useT();
  return (
    <div className="page-narrow">
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>{t("about.title")}</h1>
      <div className="framing-note">
        <p>{t("about.body.p1")}</p>
        <p>{t("about.body.p2")}</p>
        <p>{t("about.body.p3")}</p>
        <p>
          {(() => {
            const [before, after] = t("about.body.p4").split("{camus}");
            return <>{before}<a href="https://philpapers.club" style={{ color: "var(--accent)" }}>{t("about.camusLabel")}</a>{after}</>;
          })()}
        </p>
      </div>
    </div>
  );
}
