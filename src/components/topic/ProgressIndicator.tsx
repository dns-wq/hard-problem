"use client";

import { useT } from "@/i18n/LocaleProvider";

interface ProgressIndicatorProps {
  quizPassed: boolean;
  hasContributed?: boolean;
}

const STEPS = [
  { id: "read", titleKey: "topic.progress.step.read" },
  { id: "quiz", titleKey: "topic.progress.step.quiz" },
  { id: "discussed", titleKey: "topic.progress.step.discussed" },
];

export default function ProgressIndicator({ quizPassed, hasContributed = false }: ProgressIndicatorProps) {
  const t = useT();
  const filled = [true, quizPassed, hasContributed];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
      <div className="progress-dots">
        {STEPS.map((step, i) => (
          <div
            key={step.id}
            className={`progress-dot${filled[i] ? " filled" : ""}`}
            title={t(step.titleKey)}
          />
        ))}
      </div>
      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
        {filled[2] ? t("topic.progress.step.discussed") : filled[1] ? t("topic.progress.status.quizPassed") : t("topic.progress.status.reading")}
      </span>
    </div>
  );
}
