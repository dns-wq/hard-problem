"use client";

import { useState } from "react";

const PROXY_ALLOWED_DOMAINS = [
  "arxiv.org",
  "philarchive.org",
  "mit.edu",
  "stanford.edu",
  "ssrn.com",
  "philpapers.org",
  "jstor.org",
];

function isProxiable(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return PROXY_ALLOWED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

interface PaperViewerProps {
  pdfUrl: string;
  title: string;
  onClose: () => void;
}

export default function PaperViewer({ pdfUrl, title, onClose }: PaperViewerProps) {
  const [iframeError, setIframeError] = useState(false);
  const proxied = isProxiable(pdfUrl);
  const src = proxied ? `/api/proxy-pdf?url=${encodeURIComponent(pdfUrl)}` : pdfUrl;

  return (
    <div style={{
      marginTop: "1rem",
      border: "1px solid var(--border)",
      borderRadius: 8,
      overflow: "hidden",
      background: "var(--bg-surface)",
    }}>
      {/* Toolbar */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.6rem 1rem",
        borderBottom: "1px solid var(--border-light)",
        background: "var(--bg-secondary)",
      }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
          {title}
        </span>
        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "0.75rem", color: "var(--accent)", textDecoration: "none" }}
          >
            Open in new tab →
          </a>
          <button
            onClick={onClose}
            style={{ fontSize: "0.75rem", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: "0.5rem" }}
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Viewer */}
      {iframeError ? (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1rem" }}>
            The PDF couldn't be displayed inline. The publisher may block embedding.
          </p>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ textDecoration: "none", display: "inline-block" }}
          >
            Open PDF in new tab →
          </a>
        </div>
      ) : (
        <iframe
          src={src}
          title={title}
          style={{ width: "100%", height: 680, border: "none", display: "block" }}
          onError={() => setIframeError(true)}
        />
      )}
    </div>
  );
}
