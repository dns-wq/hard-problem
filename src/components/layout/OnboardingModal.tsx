"use client";

import { useEffect } from "react";
import { useOnboardingStore } from "@/stores/ui";
import { useT } from "@/i18n/LocaleProvider";

const STEP_COUNT = 3;

export function OnboardingModal() {
  const t = useT();
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

  const stepNum = String(step + 1).padStart(2, "0");
  const isLast = step === STEP_COUNT - 1;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="modal" style={{ maxWidth: 440 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
          <h2 id="onboarding-title" className="modal-title" style={{ margin: 0 }}>
            {t(`onboarding.step.${stepNum}.title`)}
          </h2>
          <button
            onClick={complete}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "1.25rem", lineHeight: 1, padding: "0 0 0 1rem" }}
            aria-label={t("onboarding.cta.dismiss")}
          >
            ×
          </button>
        </div>

        <p className="modal-body">{t(`onboarding.step.${stepNum}.body`)}</p>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {/* Step dots */}
          <div style={{ display: "flex", gap: 6 }}>
            {Array.from({ length: STEP_COUNT }).map((_, i) => (
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
                {t("onboarding.cta.back")}
              </button>
            )}
            {isLast ? (
              <button className="modal-btn modal-btn-primary" onClick={complete}>
                {t("onboarding.cta.getStarted")}
              </button>
            ) : (
              <button
                className="modal-btn modal-btn-primary"
                onClick={() => setStep((step + 1) as 0 | 1 | 2)}
              >
                {t("onboarding.cta.next")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
