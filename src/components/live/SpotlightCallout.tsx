"use client";

import { useState } from "react";
import type { CurrentSpotlight } from "@/types/database";
import { useT } from "@/i18n/LocaleProvider";

interface SpotlightCalloutProps {
  spotlight: CurrentSpotlight; // is_you === true && outcome === 'pending' (caller-gated)
  raffleMode: boolean;
  busy: boolean;
  errorMessage?: string;
  onShare: (shareNote: boolean) => void;
  onPass: () => void;
}

// The drawn participant's phone. Their note is recalled LOCALLY so they can read
// it aloud verbatim; it only reaches the projector if they tick "show on screen"
// (note_shared). Pass is always available — the consent safety valve.
export default function SpotlightCallout({ spotlight, raffleMode, busy, errorMessage, onShare, onPass }: SpotlightCalloutProps) {
  const t = useT();
  const [showNote, setShowNote] = useState(false);
  const hasNote = !!spotlight.drawn_note && !raffleMode;

  return (
    <div
      style={{
        textAlign: "center",
        padding: "1.5rem",
        border: "2px solid var(--accent)",
        borderRadius: 14,
        background: "var(--bg-surface)",
        marginBottom: "1.5rem",
      }}
    >
      <p style={{ fontSize: "1.4rem", fontWeight: 800 }}>{raffleMode ? t("live.spotlight.callout.title.won") : t("live.spotlight.callout.title.itsYou")}</p>
      <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: "0.4rem" }}>
        {raffleMode ? t("live.spotlight.callout.body.raffle") : t("live.spotlight.callout.body.discussion")}
      </p>

      {hasNote && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.7rem 0.9rem",
            background: "var(--bg-secondary)",
            borderRadius: 8,
            fontSize: "0.9rem",
            color: "var(--text-primary)",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>
            {t("live.spotlight.callout.noteLabel")}
          </span>
          “{spotlight.drawn_note}”
        </div>
      )}

      {hasNote && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            justifyContent: "center",
            marginTop: "0.9rem",
            fontSize: "0.82rem",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          <input type="checkbox" checked={showNote} onChange={(e) => setShowNote(e.target.checked)} />
          {t("live.spotlight.callout.showOnScreen")}
        </label>
      )}

      {errorMessage && <p className="auth-error" style={{ marginTop: "0.9rem" }}>{errorMessage}</p>}

      <div style={{ display: "flex", gap: "0.6rem", marginTop: "1.1rem" }}>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => onShare(showNote)}>
          {busy ? "…" : raffleMode ? t("live.spotlight.callout.cta.imHere") : t("live.spotlight.callout.cta.shareAloud")}
        </button>
        <button type="button" className="btn" style={{ flex: 1 }} disabled={busy} onClick={onPass}>
          {t("live.spotlight.callout.cta.pass")}
        </button>
      </div>
    </div>
  );
}
