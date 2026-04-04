"use client";

import { useEffect } from "react";
import { useOnboardingStore } from "@/stores/ui";

const STEPS = [
  {
    title: "Think more clearly about tech ethics.",
    body: "Hard Problem is a reading and thinking platform for STEM professionals. You'll engage with real academic papers on technology ethics and discuss them with peers — no lectures, no gamification, no easy answers.",
  },
  {
    title: "Each topic is a structured deep dive.",
    body: "Every topic has a focal paper, a counter-reading that disagrees, and a real-world anchor connecting the arguments to decisions you might actually face. Read both sides, then contribute your thinking.",
  },
  {
    title: "The AI Thinking Partner.",
    body: "Subscribers get access to an AI grounded in the source material — it helps you sharpen your arguments, not replace your thinking. You'll need to engage with the paper first before it unlocks.",
  },
];

export function OnboardingModal() {
  const { step, completed, setStep, complete } = useOnboardingStore();

  // Rehydrate persisted state on mount, then show if not completed
  useEffect(() => {
    useOnboardingStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    // After rehydration: if not completed and step is null, show step 0
    if (!completed && step === null) {
      setStep(0);
    }
  }, [completed]);

  // Don't render during SSR or if completed
  if (step === null || completed) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="modal" style={{ maxWidth: 440 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
          <h2 id="onboarding-title" className="modal-title" style={{ margin: 0 }}>
            {current.title}
          </h2>
          <button
            onClick={complete}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "1.25rem", lineHeight: 1, padding: "0 0 0 1rem" }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>

        <p className="modal-body">{current.body}</p>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {/* Step dots */}
          <div style={{ display: "flex", gap: 6 }}>
            {STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: i === step ? "var(--accent)" : "var(--border)",
                  transition: "background-color 0.15s",
                }}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            {step > 0 && (
              <button className="modal-btn" onClick={() => setStep((step - 1) as 0 | 1 | 2)}>
                Back
              </button>
            )}
            {isLast ? (
              <button className="modal-btn modal-btn-primary" onClick={complete}>
                Get started
              </button>
            ) : (
              <button
                className="modal-btn modal-btn-primary"
                onClick={() => setStep((step + 1) as 0 | 1 | 2)}
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
