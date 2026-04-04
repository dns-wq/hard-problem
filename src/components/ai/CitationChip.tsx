"use client";

import { useState, useRef, useEffect } from "react";

interface CitationChipProps {
  index: number;
  chunkText: string;
}

export default function CitationChip({ index, chunkText }: CitationChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline" }}>
      <button
        type="button"
        className="citation-chip"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Citation ${index}`}
      >
        {index}
      </button>
      {open && (
        <span style={{
          position: "absolute",
          bottom: "calc(100% + 6px)",
          left: "50%",
          transform: "translateX(-50%)",
          width: 280,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "0.65rem 0.75rem",
          fontSize: "0.78rem",
          lineHeight: 1.55,
          color: "var(--text-secondary)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          zIndex: 300,
          display: "block",
          pointerEvents: "auto",
        }}>
          <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--accent)", display: "block", marginBottom: "0.3rem" }}>
            Source [{index}]
          </span>
          {chunkText.length > 320 ? chunkText.slice(0, 320) + "…" : chunkText}
        </span>
      )}
    </span>
  );
}
