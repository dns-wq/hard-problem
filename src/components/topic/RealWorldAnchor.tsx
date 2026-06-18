"use client";

import { useT } from "@/i18n/LocaleProvider";

interface RealWorldAnchorProps {
  title: string;
  body: string;
  source_url?: string | null;
}

export default function RealWorldAnchor({ title, body, source_url }: RealWorldAnchorProps) {
  const t = useT();
  if (!title && !body) return null;

  return (
    <div className="anchor-card">
      <p className="anchor-card-label">{t("topic.anchor.label")}</p>
      <p className="anchor-card-title">{title}</p>
      <p className="anchor-card-body">{body}</p>
      {source_url && (
        <a
          href={source_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: "0.8rem", color: "var(--accent)", display: "inline-block", marginTop: "0.5rem" }}
        >
          {t("topic.anchor.source")}
        </a>
      )}
    </div>
  );
}
