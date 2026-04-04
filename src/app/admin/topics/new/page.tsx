"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function NewTopicPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    slug: "",
    framing_note: "",
    discussion_prompt: "",
    anchor_title: "",
    anchor_body: "",
    anchor_source_url: "",
    difficulty: "intermediate" as "accessible" | "intermediate" | "advanced",
    domains: "",
    sequence_number: "",
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState("");

  const create = trpc.topics.create.useMutation({
    onSuccess: (topic) => router.push(`/admin/topics/${topic.id}`),
    onError: (e) => setError(e.message),
  });

  function handleTitleChange(title: string) {
    setForm((f) => ({
      ...f,
      title,
      slug: slugEdited ? f.slug : slugify(title),
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    create.mutate({
      title: form.title,
      slug: form.slug,
      framing_note: form.framing_note,
      discussion_prompt: form.discussion_prompt,
      real_world_anchor: {
        title: form.anchor_title,
        body: form.anchor_body,
        source_url: form.anchor_source_url || undefined,
      },
      difficulty: form.difficulty,
      domains: form.domains.split(",").map((d) => d.trim()).filter(Boolean),
      sequence_number: form.sequence_number ? parseInt(form.sequence_number) : undefined,
    });
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "1.5rem" }}>New topic</h1>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Title <span style={{ color: "#c44" }}>*</span></label>
          <input
            className="form-input"
            value={form.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Who's responsible when autonomous systems cause harm?"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Slug <span style={{ color: "#c44" }}>*</span></label>
          <input
            className="form-input"
            value={form.slug}
            onChange={(e) => { setSlugEdited(true); setForm((f) => ({ ...f, slug: e.target.value })); }}
            placeholder="autonomous-systems-responsibility"
            pattern="[a-z0-9-]+"
            required
          />
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>URL: /topics/{form.slug || "…"}</p>
        </div>

        <div className="form-group">
          <label className="form-label">Difficulty</label>
          <select className="form-select" value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as typeof f.difficulty }))}>
            <option value="accessible">Accessible</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Domains <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— comma-separated</span></label>
          <input
            className="form-input"
            value={form.domains}
            onChange={(e) => setForm((f) => ({ ...f, domains: e.target.value }))}
            placeholder="ai_safety, autonomous_systems, moral_responsibility"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Sequence number <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none" }}>— optional ordering</span></label>
          <input
            className="form-input"
            type="number"
            value={form.sequence_number}
            onChange={(e) => setForm((f) => ({ ...f, sequence_number: e.target.value }))}
            placeholder="1"
            style={{ maxWidth: 120 }}
          />
        </div>

        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "1.5rem 0" }} />

        <div className="form-group">
          <label className="form-label">Framing note <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none" }}>— 300–500 words, Markdown</span></label>
          <textarea
            className="form-textarea"
            value={form.framing_note}
            onChange={(e) => setForm((f) => ({ ...f, framing_note: e.target.value }))}
            placeholder="Why this paper matters, what's at stake, what intellectual context it sits in…"
            style={{ minHeight: 180 }}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Discussion prompt <span style={{ color: "#c44" }}>*</span></label>
          <input
            className="form-input"
            value={form.discussion_prompt}
            onChange={(e) => setForm((f) => ({ ...f, discussion_prompt: e.target.value }))}
            placeholder="Do we need new concepts of responsibility for autonomous systems?"
            required
          />
        </div>

        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "1.5rem 0" }} />
        <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Real-world anchor</p>

        <div className="form-group">
          <label className="form-label">Anchor title <span style={{ color: "#c44" }}>*</span></label>
          <input className="form-input" value={form.anchor_title} onChange={(e) => setForm((f) => ({ ...f, anchor_title: e.target.value }))} placeholder="The Uber Self-Driving Car Fatality (2018)" required />
        </div>

        <div className="form-group">
          <label className="form-label">Anchor body <span style={{ color: "#c44" }}>*</span></label>
          <textarea
            className="form-textarea"
            value={form.anchor_body}
            onChange={(e) => setForm((f) => ({ ...f, anchor_body: e.target.value }))}
            placeholder="In March 2018, an Uber autonomous vehicle…"
            required
            style={{ minHeight: 100 }}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Anchor source URL <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none" }}>— optional</span></label>
          <input className="form-input" type="url" value={form.anchor_source_url} onChange={(e) => setForm((f) => ({ ...f, anchor_source_url: e.target.value }))} placeholder="https://…" />
        </div>

        {error && <p style={{ color: "#c44", fontSize: "0.85rem", marginBottom: "1rem" }}>{error}</p>}

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create topic (draft)"}
          </button>
          <button type="button" className="btn" onClick={() => router.back()}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
