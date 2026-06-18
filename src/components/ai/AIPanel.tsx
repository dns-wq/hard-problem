"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useT } from "@/i18n/LocaleProvider";
import QuizGate from "./QuizGate";
import AIChatInterface from "./AIChatInterface";

interface AIPanelProps {
  topicId: string;
  currentUserId: string | null;
}

export default function AIPanel({ topicId, currentUserId }: AIPanelProps) {
  const t = useT();
  const [quizPassed, setQuizPassed] = useState<boolean | null>(null);

  const { data: access, isLoading } = trpc.ai.checkAccess.useQuery(
    { topicId },
    { enabled: !!currentUserId },
  );

  // Once we get access data, sync local quizPassed state
  if (access && quizPassed === null) {
    setQuizPassed(access.quizPassed);
  }

  // Unauthenticated
  if (!currentUserId) {
    return (
      <div className="ai-panel" style={{ justifyContent: "center", alignItems: "center", padding: "1.5rem", textAlign: "center" }}>
        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "1rem" }}>
          {t("ai.signedOut.prompt")}
        </p>
        <Link href="/auth/login" className="btn btn-primary" style={{ textDecoration: "none", fontSize: "0.85rem" }}>
          {t("nav.signIn")}
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="ai-panel" style={{ justifyContent: "center", alignItems: "center" }}>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{t("common.loading")}</p>
      </div>
    );
  }

  // No Pro subscription
  if (access && !access.hasSubscription) {
    return (
      <div className="ai-panel" style={{ justifyContent: "center", alignItems: "center", padding: "1.5rem", textAlign: "center" }}>
        <div>
          <p style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>{t("ai.pro.title")}</p>
          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "1rem" }}>
            {t("ai.pro.body")}
          </p>
          <Link href="/upgrade" className="btn btn-primary" style={{ textDecoration: "none", fontSize: "0.85rem" }}>
            {t("ai.pro.cta")}
          </Link>
        </div>
      </div>
    );
  }

  const effectiveQuizPassed = quizPassed ?? (access?.quizPassed ?? false);

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <p className="ai-panel-title">{t("ai.panel.title")}</p>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
          {effectiveQuizPassed ? t("ai.panel.subtitleGrounded") : t("ai.panel.subtitleLocked")}
        </p>
      </div>

      {effectiveQuizPassed ? (
        <AIChatInterface topicId={topicId} />
      ) : (
        <QuizGate
          topicId={topicId}
          onPassed={() => setQuizPassed(true)}
        />
      )}
    </div>
  );
}
