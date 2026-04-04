"use client";

import { useState } from "react";
import PaperViewer from "./PaperViewer";

const ROLE_LABEL: Record<string, string> = {
  focal: "Focal",
  counter: "Counter",
  supplementary: "Supplementary",
};

const ROLE_COLOR: Record<string, string> = {
  focal: "var(--accent)",
  counter: "#c44",
  supplementary: "var(--text-muted)",
};

interface Paper {
  id: string;
  title: string;
  authors: string;
  year?: number | null;
  source_url: string;
  pdf_url?: string | null;
  abstract?: string | null;
  role: string;
  is_open_access: boolean;
}

interface PapersSectionProps {
  papers: Paper[];
}

export default function PapersSection({ papers }: PapersSectionProps) {
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [expandedAbstract, setExpandedAbstract] = useState<Set<string>>(new Set());

  if (!papers.length) return null;

  function toggleAbstract(id: string) {
    setExpandedAbstract((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div>
      <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "1rem" }}>
        Papers
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {papers.map((paper) => (
          <div key={paper.id}>
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-light)",
                borderRadius: 8,
                padding: "1rem 1.25rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.3rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.68rem", fontWeight: 700, color: ROLE_COLOR[paper.role] ?? "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {ROLE_LABEL[paper.role] ?? paper.role}
                    </span>
                    {paper.is_open_access && (
                      <span className="tag tag-accent">Open access</span>
                    )}
                  </div>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
                    <a href={paper.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-primary)", textDecoration: "none" }}>
                      {paper.title}
                    </a>
                  </h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.2rem 0 0" }}>
                    {paper.authors}{paper.year ? `, ${paper.year}` : ""}
                  </p>
                </div>
              </div>

              {/* Abstract */}
              {paper.abstract && (
                <div style={{ marginTop: "0.6rem" }}>
                  {expandedAbstract.has(paper.id) ? (
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                      {paper.abstract}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggleAbstract(paper.id)}
                    style={{ fontSize: "0.75rem", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: "0.3rem 0 0", display: "block" }}
                  >
                    {expandedAbstract.has(paper.id) ? "Hide abstract" : "Show abstract"}
                  </button>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
                {paper.is_open_access && paper.pdf_url ? (
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: "0.775rem", padding: "0.25rem 0.65rem" }}
                    onClick={() => setViewingId(viewingId === paper.id ? null : paper.id)}
                  >
                    {viewingId === paper.id ? "Close viewer" : "View PDF"}
                  </button>
                ) : (
                  <a
                    href={paper.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn"
                    style={{ fontSize: "0.775rem", padding: "0.25rem 0.65rem", textDecoration: "none" }}
                  >
                    Read paper →
                  </a>
                )}
                {paper.pdf_url && !paper.is_open_access && (
                  <a
                    href={paper.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "0.75rem", color: "var(--accent)", alignSelf: "center", textDecoration: "none" }}
                  >
                    PDF →
                  </a>
                )}
              </div>
            </div>

            {/* Inline viewer */}
            {viewingId === paper.id && paper.pdf_url && (
              <PaperViewer
                pdfUrl={paper.pdf_url}
                title={paper.title}
                onClose={() => setViewingId(null)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
