"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type ConceptFormState = {
  term: string;
  slug: string;
  definition: string;
  examples: string;
  related_terms: string;
};

const BLANK: ConceptFormState = { term: "", slug: "", definition: "", examples: "", related_terms: "" };

export default function AdminConceptsPage() {
  const { data: concepts, isLoading, refetch } = trpc.concepts.list.useQuery();
  const createMut = trpc.concepts.create.useMutation({ onSuccess: () => { refetch(); setAdding(false); setForm(BLANK); setSlugEdited(false); } });
  const updateMut = trpc.concepts.update.useMutation({ onSuccess: () => { refetch(); setEditingId(null); } });
  const deleteMut = trpc.concepts.delete.useMutation({ onSuccess: () => refetch() });

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<ConceptFormState>(BLANK);
  const [slugEdited, setSlugEdited] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ConceptFormState>>({});
  const [formError, setFormError] = useState("");

  function handleTermChange(term: string) {
    setForm((f) => ({ ...f, term, slug: slugEdited ? f.slug : slugify(term) }));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    createMut.mutate({
      term: form.term,
      slug: form.slug,
      definition: form.definition,
      examples: form.examples || undefined,
      related_terms: form.related_terms.split(",").map((s) => s.trim()).filter(Boolean),
    }, { onError: (e) => setFormError(e.message) });
  }

  function startEdit(c: { id: string; term: string; definition: string; examples?: string | null; related_terms?: string[] | null }) {
    setEditingId(c.id);
    setEditForm({
      term: c.term,
      definition: c.definition,
      examples: c.examples ?? "",
      related_terms: (c.related_terms ?? []).join(", "),
    });
  }

  function handleUpdate(id: string) {
    updateMut.mutate({
      id,
      term: editForm.term,
      definition: editForm.definition,
      examples: editForm.examples || undefined,
      related_terms: editForm.related_terms?.split(",").map((s) => s.trim()).filter(Boolean),
    });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700 }}>Concepts</h1>
        {!adding && (
          <button className="btn btn-primary" onClick={() => setAdding(true)}>+ New concept</button>
        )}
      </div>

      {adding && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "1.25rem", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>New concept</h2>
          <form onSubmit={handleCreate}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Term <span style={{ color: "#c44" }}>*</span></label>
                <input className="form-input" value={form.term} onChange={(e) => handleTermChange(e.target.value)} placeholder="Moral responsibility" required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Slug <span style={{ color: "#c44" }}>*</span></label>
                <input
                  className="form-input"
                  value={form.slug}
                  onChange={(e) => { setSlugEdited(true); setForm((f) => ({ ...f, slug: e.target.value })); }}
                  pattern="[a-z0-9-]+"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Definition <span style={{ color: "#c44" }}>*</span></label>
              <textarea className="form-textarea" value={form.definition} onChange={(e) => setForm((f) => ({ ...f, definition: e.target.value }))} placeholder="The obligation or accountability attributed to an agent…" style={{ minHeight: 80 }} required />
            </div>

            <div className="form-group">
              <label className="form-label">Examples <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none" }}>— optional, Markdown</span></label>
              <textarea className="form-textarea" value={form.examples} onChange={(e) => setForm((f) => ({ ...f, examples: e.target.value }))} placeholder="e.g. A driver is morally responsible for…" style={{ minHeight: 60 }} />
            </div>

            <div className="form-group">
              <label className="form-label">Related terms <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none" }}>— comma-separated</span></label>
              <input className="form-input" value={form.related_terms} onChange={(e) => setForm((f) => ({ ...f, related_terms: e.target.value }))} placeholder="accountability, agency, culpability" />
            </div>

            {formError && <p style={{ color: "#c44", fontSize: "0.85rem", marginBottom: "0.75rem" }}>{formError}</p>}

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button type="submit" className="btn btn-primary" disabled={createMut.isPending}>
                {createMut.isPending ? "Creating…" : "Create concept"}
              </button>
              <button type="button" className="btn" onClick={() => { setAdding(false); setForm(BLANK); setSlugEdited(false); setFormError(""); }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : !concepts?.length ? (
        <p style={{ color: "var(--text-muted)" }}>No concepts yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {concepts.map((c) => (
            <div key={c.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: 8, padding: "1rem 1.25rem" }}>
              {editingId === c.id ? (
                <div>
                  <div className="form-group">
                    <label className="form-label">Term</label>
                    <input className="form-input" value={editForm.term ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, term: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Definition</label>
                    <textarea className="form-textarea" value={editForm.definition ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, definition: e.target.value }))} style={{ minHeight: 80 }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Examples</label>
                    <textarea className="form-textarea" value={editForm.examples ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, examples: e.target.value }))} style={{ minHeight: 60 }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Related terms</label>
                    <input className="form-input" value={editForm.related_terms ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, related_terms: e.target.value }))} />
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button className="btn btn-primary" style={{ fontSize: "0.8rem" }} onClick={() => handleUpdate(c.id)} disabled={updateMut.isPending}>
                      {updateMut.isPending ? "Saving…" : "Save"}
                    </button>
                    <button className="btn" style={{ fontSize: "0.8rem" }} onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{c.term}</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "0.5rem" }}>/{c.slug}</span>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button className="btn" style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }} onClick={() => startEdit(c)}>Edit</button>
                      <button
                        className="btn"
                        style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", color: "#c44", borderColor: "#c44" }}
                        onClick={() => { if (confirm(`Delete "${c.term}"?`)) deleteMut.mutate({ id: c.id }); }}
                        disabled={deleteMut.isPending}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.4rem", lineHeight: 1.5 }}>{c.definition}</p>
                  {c.related_terms && c.related_terms.length > 0 && (
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                      Related: {c.related_terms.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
