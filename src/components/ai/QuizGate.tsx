"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useT } from "@/i18n/LocaleProvider";

interface QuizGateProps {
  topicId: string;
  onPassed: () => void;
}

export default function QuizGate({ topicId, onPassed }: QuizGateProps) {
  const t = useT();
  const { data: questions, isLoading } = trpc.quiz.byTopic.useQuery({ topicId });
  const submit = trpc.ai.submitQuiz.useMutation();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<{ questionId: string; correct: boolean; explanation: string | null }[] | null>(null);
  const [passed, setPassed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await submit.mutateAsync({ topicId, answers });
    setResults(result.results);
    setPassed(result.passed);
    if (result.passed) {
      setTimeout(onPassed, 1800);
    }
  }

  if (isLoading) {
    return <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "1rem" }}>{t("ai.quiz.loading")}</p>;
  }

  if (!questions || questions.length === 0) {
    return (
      <div style={{ padding: "1.25rem", textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
          {t("ai.quiz.emptyTitle")}
        </p>
      </div>
    );
  }

  if (passed) {
    return (
      <div style={{ padding: "1.5rem", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--success)", marginBottom: "0.4rem" }}>{t("ai.quiz.passedTitle")}</p>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{t("ai.quiz.passedBody")}</p>
      </div>
    );
  }

  return (
    <div style={{ overflowY: "auto", flex: 1, padding: "1rem 1.25rem" }}>
      <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1.25rem", lineHeight: 1.55 }}>
        {t("ai.quiz.intro")}
      </p>

      <form onSubmit={handleSubmit}>
        {questions.map((q, qi) => {
          const opts = (q.options as { label: string; text: string }[] | null) ?? [];
          const result = results?.find((r) => r.questionId === q.id);
          const isCorrect = result?.correct;

          return (
            <div key={q.id} style={{
              marginBottom: "1.25rem",
              padding: "0.875rem",
              borderRadius: 6,
              border: "1px solid",
              borderColor: results
                ? isCorrect ? "rgba(42,122,59,0.3)" : "rgba(196,68,68,0.3)"
                : "var(--border-light)",
              background: results
                ? isCorrect ? "rgba(42,122,59,0.04)" : "rgba(196,68,68,0.04)"
                : "var(--bg-primary)",
            }}>
              <p style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.75rem", lineHeight: 1.5 }}>
                <span style={{ color: "var(--text-muted)", marginRight: "0.4rem" }}>{qi + 1}.</span>
                {q.question_text}
              </p>

              {q.question_type === "true_false" ? (
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  {[
                    { value: "true", label: t("live.quiz.choice.true") },
                    { value: "false", label: t("live.quiz.choice.false") },
                  ].map((opt) => (
                    <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name={q.id}
                        value={opt.value}
                        checked={answers[q.id] === opt.value}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt.value }))}
                        disabled={!!results}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {opts.map((opt) => (
                    <label key={opt.label} style={{ display: "flex", alignItems: "flex-start", gap: "0.4rem", fontSize: "0.85rem", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name={q.id}
                        value={opt.label}
                        checked={answers[q.id] === opt.label}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt.label }))}
                        disabled={!!results}
                        style={{ marginTop: "0.15rem", flexShrink: 0 }}
                      />
                      <span><strong style={{ color: "var(--text-muted)", marginRight: "0.25rem" }}>{opt.label}.</strong>{opt.text}</span>
                    </label>
                  ))}
                </div>
              )}

              {result && !isCorrect && result.explanation && (
                <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.6rem", lineHeight: 1.5, borderTop: "1px solid var(--border-light)", paddingTop: "0.5rem" }}>
                  <strong>{t("ai.quiz.explanationLabel")}</strong> {result.explanation}
                </p>
              )}
            </div>
          );
        })}

        {results && !passed && (
          <p style={{ fontSize: "0.82rem", color: "var(--danger)", marginBottom: "0.75rem" }}>
            {t("ai.quiz.incorrectRetry")}
          </p>
        )}

        <button
          type={results && !passed ? "button" : "submit"}
          className="btn btn-primary"
          style={{ width: "100%", marginTop: "0.25rem" }}
          disabled={Object.keys(answers).length < questions.length || submit.isPending}
          onClick={results && !passed ? () => { setResults(null); setAnswers({}); } : undefined}
        >
          {submit.isPending ? t("ai.quiz.cta.checking") : results && !passed ? t("ai.quiz.cta.tryAgain") : t("ai.quiz.cta.submit")}
        </button>
      </form>
    </div>
  );
}
