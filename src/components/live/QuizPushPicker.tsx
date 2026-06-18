"use client";

import type { QuizQuestionType } from "@/types/database";
import { useT } from "@/i18n/LocaleProvider";

interface PickerQuestion {
  id: string;
  question_text: string;
  question_type: QuizQuestionType;
}

interface QuizPushPickerProps {
  questions: PickerQuestion[];
  currentQuestionId?: string | null;
  busy: boolean;
  onPush: (id: string) => void;
}

// Host-side list of the topic's quiz_questions to push into the room.
export default function QuizPushPicker({ questions, currentQuestionId, busy, onPush }: QuizPushPickerProps) {
  const t = useT();
  if (questions.length === 0) {
    return <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t("live.quiz.noQuestions")}</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {questions.map((q) => (
        <div
          key={q.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.6rem 0.85rem",
            background: "var(--bg-surface)",
            border: `1px solid ${currentQuestionId === q.id ? "var(--accent)" : "var(--border-light)"}`,
            borderRadius: 8,
          }}
        >
          <span style={{ flex: 1, fontSize: "0.88rem" }}>{q.question_text}</span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => onPush(q.id)}
            style={{ padding: "0.4rem 1rem", fontSize: "0.85rem" }}
          >
            {currentQuestionId === q.id ? t("live.quiz.reask") : t("live.quiz.ask")}
          </button>
        </div>
      ))}
    </div>
  );
}
