"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

export default function NewPaperPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const topicId = params.id;

  const [form, setForm] = useState({
    title: "",
    authors: "",
    year: "",
    source_url: "",
    pdf_url: "",
    abstract: "",
    role: "focal" as "focal" | "counter" | "supplementary",
    is_open_access: false,
    display_order: "0",
    full_extracted_text: "",
  });
  const [savedPaperId, setSavedPaperId] = useState<string | null>(null);
  const [embedStatus, setEmbedStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [embedError, setEmbedError] = useState("");
  const [error, setError] = useState("");

  const create = trpc.papers.create.useMutation({
    onError: (e) => setError(e.message),
    onSuccess: async (paper) => {
      setSavedPaperId(paper.id);
      // If extracted text was provided, save it immediately
      if (form.full_extracted_text.trim()) {
        await saveText.mutateAsync({ id: paper.id, full_extracted_text: form.full_extracted_text });
      }
    },
  });

  const saveText = trpc.papers.updateExtractedText.useMutation({
    onError: (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    create.mutate({
      topic_id: topicId,
      title: form.title,
      authors: form.authors,
      year: form.year ? parseInt(form.year) : undefined,
      source_url: form.source_url,
      pdf_url: form.pdf_url || undefined,
      abstract: form.abstract || undefined,
      role: form.role,
      is_open_access: form.is_open_access,
      display_order: parseInt(form.display_order) || 0,
    });
  }

  async function handleEmbed() {
    if (!savedPaperId) return;
    setEmbedStatus("loading");
    setEmbedError("");
    try {
      const res = await fetch("/api/admin/embed-paper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId: savedPaperId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setEmbedStatus("done");
    } catch (err: unknown) {
      setEmbedStatus("error");
      setEmbedError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  const isSaved = !!savedPaperId;
  const hasExtractedText = form.full_extracted_text.trim().length > 0;

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <button
          type="button"
          className="btn"
          style={{ fontSize: "0.8rem", marginBottom: "0.75rem" }}
          onClick={() => router.push(`/admin/topics/${topicId}`)}
        >
          ← Back to topic
        </button>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700 }}>Add paper</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Title <span style={{ color: "#c44" }}>*</span></label>
          <input
            className="form-input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Moral Responsibility for Computing Artifacts: The Rules"
            required
            disabled={isSaved}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Authors <span style={{ color: "#c44" }}>*</span></label>
          <input
            className="form-input"
            value={form.authors}
            onChange={(e) => setForm((f) => ({ ...f, authors: e.target.value }))}
            placeholder="Nissenbaum, H."
            required
            disabled={isSaved}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Year</label>
            <input
              className="form-input"
              type="number"
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
              placeholder="1994"
              disabled={isSaved}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Role <span style={{ color: "#c44" }}>*</span></label>
            <select
              className="form-select"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as typeof f.role }))}
              disabled={isSaved}
            >
              <option value="focal">Focal</option>
              <option value="counter">Counter</option>
              <option value="supplementary">Supplementary</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Display order</label>
            <input
              className="form-input"
              type="number"
              value={form.display_order}
              onChange={(e) => setForm((f) => ({ ...f, display_order: e.target.value }))}
              disabled={isSaved}
            />
          </div>
        </div>

        <div className="form-group" style={{ marginTop: "1rem" }}>
          <label className="form-label">Source URL <span style={{ color: "#c44" }}>*</span></label>
          <input
            className="form-input"
            type="url"
            value={form.source_url}
            onChange={(e) => setForm((f) => ({ ...f, source_url: e.target.value }))}
            placeholder="https://philarchive.org/archive/NIS…"
            required
            disabled={isSaved}
          />
        </div>

        <div className="form-group">
          <label className="form-label">PDF URL <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none" }}>— direct link for inline viewer</span></label>
          <input
            className="form-input"
            type="url"
            value={form.pdf_url}
            onChange={(e) => setForm((f) => ({ ...f, pdf_url: e.target.value }))}
            placeholder="https://arxiv.org/pdf/…"
            disabled={isSaved}
          />
        </div>

        <div className="form-group">
          <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={form.is_open_access}
              onChange={(e) => setForm((f) => ({ ...f, is_open_access: e.target.checked }))}
              disabled={isSaved}
            />
            Open access
          </label>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            If unchecked, users see only the abstract and a link out.
          </p>
        </div>

        <div className="form-group">
          <label className="form-label">Abstract</label>
          <textarea
            className="form-textarea"
            value={form.abstract}
            onChange={(e) => setForm((f) => ({ ...f, abstract: e.target.value }))}
            placeholder="Paste the paper abstract…"
            style={{ minHeight: 100 }}
            disabled={isSaved}
          />
        </div>

        {error && <p style={{ color: "#c44", fontSize: "0.85rem", marginBottom: "1rem" }}>{error}</p>}

        {!isSaved && (
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button type="submit" className="btn btn-primary" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Save paper"}
            </button>
            <button type="button" className="btn" onClick={() => router.push(`/admin/topics/${topicId}`)}>
              Cancel
            </button>
          </div>
        )}
      </form>

      {/* Docling / RAG section — shown after paper is saved */}
      {isSaved && (
        <div style={{ marginTop: "2rem", borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.5rem" }}>
            RAG extraction (Docling)
          </p>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
            Run Docling locally to extract the paper text, then paste the Markdown output below.
            Once saved, click "Embed paper" to generate vector embeddings for AI Q&amp;A.
          </p>

          <div className="form-group">
            <label className="form-label">Extracted text (Markdown)</label>
            <textarea
              className="form-textarea"
              value={form.full_extracted_text}
              onChange={(e) => setForm((f) => ({ ...f, full_extracted_text: e.target.value }))}
              placeholder="Paste Docling markdown output here…"
              style={{ minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem" }}
            />
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!hasExtractedText || saveText.isPending}
              onClick={() => saveText.mutate({ id: savedPaperId!, full_extracted_text: form.full_extracted_text })}
            >
              {saveText.isPending ? "Saving…" : "Save extracted text"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!hasExtractedText || embedStatus === "loading"}
              onClick={handleEmbed}
              title={!hasExtractedText ? "Save extracted text first" : undefined}
            >
              {embedStatus === "loading" ? "Embedding…" : embedStatus === "done" ? "Re-embed" : "Embed paper"}
            </button>
            {embedStatus === "done" && (
              <span style={{ fontSize: "0.8rem", color: "#2a7a3b" }}>Embeddings saved.</span>
            )}
            {embedStatus === "error" && (
              <span style={{ fontSize: "0.8rem", color: "#c44" }}>{embedError}</span>
            )}
          </div>

          <div style={{ marginTop: "1.5rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => router.push(`/admin/topics/${topicId}`)}
            >
              Done — back to topic
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
