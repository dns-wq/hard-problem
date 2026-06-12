"use client";

import type { CurrentQuizRound } from "@/types/database";

interface QuizQuestionCardProps {
  round: CurrentQuizRound;
  busy: boolean;
  errorMessage?: string;
  onAnswer: (answer: string) => void;
}

// Phone answer UI. The submitted answer is the option LABEL ('A'/'B'/…) for MCQ
// or 'true'/'false' for T/F — matching how correct_answer is stored.
export default function QuizQuestionCard({ round, busy, errorMessage, onAnswer }: QuizQuestionCardProps) {
  const locked = !!round.my_answer;
  const revealed = round.status === "revealed";

  const choices =
    round.question_type === "true_false"
      ? [
          { label: "true", text: "True" },
          { label: "false", text: "False" },
        ]
      : (round.options ?? []).map((o) => ({ label: o.label, text: o.text }));

  return (
    <div>
      <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
        Question {round.sequence}
      </p>
      <h2 style={{ fontSize: "1.1rem", fontWeight: 700, lineHeight: 1.4, margin: "0.4rem 0 1rem" }}>{round.question_text}</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {choices.map((c) => {
          const mine = round.my_answer?.toLowerCase() === c.label.toLowerCase();
          const isCorrect = revealed && round.correct_answer?.toLowerCase() === c.label.toLowerCase();
          return (
            <button
              key={c.label}
              type="button"
              className={`live-option-btn${mine ? " selected" : ""}`}
              disabled={locked || revealed || busy}
              onClick={() => onAnswer(c.label)}
              style={isCorrect ? { borderColor: "var(--accent)", boxShadow: "inset 0 0 0 1px var(--accent)" } : undefined}
            >
              {round.question_type === "mcq" ? `${c.label}. ${c.text}` : c.text}
              {revealed && isCorrect ? "  ✓" : ""}
              {revealed && mine && !isCorrect ? "  ✗" : ""}
            </button>
          );
        })}
      </div>

      {errorMessage && <p className="auth-error" style={{ marginTop: "0.75rem" }}>{errorMessage}</p>}

      {locked && !revealed && (
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "1rem", textAlign: "center" }}>
          Answer locked in — waiting for the host to reveal.
        </p>
      )}
      {revealed && (
        <div style={{ marginTop: "1rem" }}>
          <p style={{ fontSize: "0.9rem", fontWeight: 700, color: round.my_is_correct ? "var(--accent)" : "var(--text-secondary)" }}>
            {round.my_answer ? (round.my_is_correct ? "Correct! 🎉" : "Not this time.") : "Time's up."}
          </p>
          {round.explanation && (
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.4rem", lineHeight: 1.5 }}>{round.explanation}</p>
          )}
        </div>
      )}
    </div>
  );
}
