interface ProgressIndicatorProps {
  quizPassed: boolean;
  hasContributed?: boolean;
}

const STEPS = [
  { label: "Read" },
  { label: "Quiz" },
  { label: "Discussed" },
];

export default function ProgressIndicator({ quizPassed, hasContributed = false }: ProgressIndicatorProps) {
  const filled = [true, quizPassed, hasContributed];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
      <div className="progress-dots">
        {STEPS.map((step, i) => (
          <div
            key={step.label}
            className={`progress-dot${filled[i] ? " filled" : ""}`}
            title={step.label}
          />
        ))}
      </div>
      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
        {filled[2] ? "Discussed" : filled[1] ? "Quiz passed" : "Reading"}
      </span>
    </div>
  );
}
