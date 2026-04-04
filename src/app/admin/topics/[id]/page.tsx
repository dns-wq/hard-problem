"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import type { Topic } from "@/types/database";

type Tab = "details" | "papers" | "concepts" | "quiz";

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function EditTopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("details");

  const { data: topic, isLoading, refetch } = trpc.topics.adminById.useQuery({ id });

  if (isLoading) return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (!topic) return <p style={{ color: "#c44" }}>Topic not found.</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
            <Link href="/admin/topics" style={{ color: "var(--accent)", textDecoration: "none" }}>← Topics</Link>
          </div>
          <h1 style={{ fontSize: "1.3rem", fontWeight: 700, margin: 0 }}>{topic.title}</h1>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{topic.slug} · {topic.status}</span>
        </div>
        {topic.status === "published" && (
          <Link href={`/topics/${topic.slug}`} className="btn" target="_blank" style={{ fontSize: "0.8rem" }}>
            View live ↗
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: "1.5rem" }}>
        {(["details", "papers", "concepts", "quiz"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: "0.85rem",
              padding: "0.5rem 1rem",
              border: "none",
              borderBottom: `2px solid ${tab === t ? "var(--accent)" : "transparent"}`,
              background: "transparent",
              color: tab === t ? "var(--accent)" : "var(--text-secondary)",
              cursor: "pointer",
              fontWeight: tab === t ? 600 : 400,
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "details" && <DetailsTab topic={topic as unknown as Topic} onSaved={refetch} />}
      {tab === "papers" && <PapersTab topicId={id} />}
      {tab === "concepts" && <ConceptsTab topicId={id} />}
      {tab === "quiz" && <QuizTab topicId={id} />}
    </div>
  );
}

// ===== Details Tab =====

function DetailsTab({ topic, onSaved }: { topic: Topic; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: topic.title,
    slug: topic.slug,
    framing_note: topic.framing_note,
    discussion_prompt: topic.discussion_prompt,
    anchor_title: (topic.real_world_anchor as { title?: string })?.title ?? "",
    anchor_body: (topic.real_world_anchor as { body?: string })?.body ?? "",
    anchor_source_url: (topic.real_world_anchor as { source_url?: string })?.source_url ?? "",
    difficulty: topic.difficulty as "accessible" | "intermediate" | "advanced",
    domains: (topic.domains ?? []).join(", "),
    sequence_number: topic.sequence_number?.toString() ?? "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const update = trpc.topics.update.useMutation({
    onSuccess: () => { setSaved(true); onSaved(); setTimeout(() => setSaved(false), 2000); },
    onError: (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    update.mutate({
      id: topic.id,
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
    <form onSubmit={handleSubmit} style={{ maxWidth: 680 }}>
      <div className="form-group">
        <label className="form-label">Title</label>
        <input className="form-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
      </div>
      <div className="form-group">
        <label className="form-label">Slug</label>
        <input className="form-input" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} pattern="[a-z0-9-]+" required />
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>URL: /topics/{form.slug}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="form-group">
          <label className="form-label">Difficulty</label>
          <select className="form-select" value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as typeof f.difficulty }))}>
            <option value="accessible">Accessible</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Sequence</label>
          <input className="form-input" type="number" value={form.sequence_number} onChange={(e) => setForm((f) => ({ ...f, sequence_number: e.target.value }))} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Domains — comma-separated</label>
        <input className="form-input" value={form.domains} onChange={(e) => setForm((f) => ({ ...f, domains: e.target.value }))} placeholder="ai_safety, autonomous_systems" />
      </div>
      <div className="form-group">
        <label className="form-label">Discussion prompt</label>
        <input className="form-input" value={form.discussion_prompt} onChange={(e) => setForm((f) => ({ ...f, discussion_prompt: e.target.value }))} required />
      </div>
      <div className="form-group">
        <label className="form-label">Framing note — Markdown</label>
        <textarea className="form-textarea" value={form.framing_note} onChange={(e) => setForm((f) => ({ ...f, framing_note: e.target.value }))} style={{ minHeight: 200 }} />
      </div>
      <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "1.25rem 0" }} />
      <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Real-world anchor</p>
      <div className="form-group">
        <label className="form-label">Anchor title</label>
        <input className="form-input" value={form.anchor_title} onChange={(e) => setForm((f) => ({ ...f, anchor_title: e.target.value }))} />
      </div>
      <div className="form-group">
        <label className="form-label">Anchor body</label>
        <textarea className="form-textarea" value={form.anchor_body} onChange={(e) => setForm((f) => ({ ...f, anchor_body: e.target.value }))} style={{ minHeight: 100 }} />
      </div>
      <div className="form-group">
        <label className="form-label">Anchor source URL — optional</label>
        <input className="form-input" type="url" value={form.anchor_source_url} onChange={(e) => setForm((f) => ({ ...f, anchor_source_url: e.target.value }))} />
      </div>
      {error && <p style={{ color: "#c44", fontSize: "0.85rem", marginBottom: "1rem" }}>{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={update.isPending}>
        {update.isPending ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
      </button>
    </form>
  );
}

// ===== Papers Tab =====

function PapersTab({ topicId }: { topicId: string }) {
  const { data: papers, isLoading, refetch } = trpc.papers.adminByTopic.useQuery({ topicId });
  const deletePaper = trpc.papers.delete.useMutation({ onSuccess: () => refetch() });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Papers</h2>
        <Link href={`/admin/topics/${topicId}/papers/new`} className="btn btn-primary" style={{ fontSize: "0.8rem" }}>+ Add paper</Link>
      </div>
      {isLoading ? <p style={{ color: "var(--text-muted)" }}>Loading…</p> : !papers?.length ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No papers yet. Add a focal paper first.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {papers.map((p) => (
            <div key={p.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: 6, padding: "0.875rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
              <div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.2rem" }}>
                  <span style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: p.role === "focal" ? "var(--accent)" : "var(--text-muted)" }}>{p.role}</span>
                  {p.is_open_access && <span style={{ fontSize: "0.65rem", color: "#2a7a3b", background: "rgba(42,122,59,0.08)", padding: "1px 5px", borderRadius: 3, border: "1px solid rgba(42,122,59,0.15)" }}>Open access</span>}
                  {p.hasExtraction ? <span style={{ fontSize: "0.65rem", color: "#3b6ea5", background: "rgba(59,110,165,0.08)", padding: "1px 5px", borderRadius: 3, border: "1px solid rgba(59,110,165,0.15)" }}>Docling ✓</span> : <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", background: "var(--bg-secondary)", padding: "1px 5px", borderRadius: 3 }}>No extraction</span>}
                </div>
                <div style={{ fontSize: "0.9rem", fontWeight: 500 }}>{p.title}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{p.authors}{p.year ? ` · ${p.year}` : ""}</div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                <Link href={`/admin/topics/${topicId}/papers/new?edit=${p.id}`} className="btn" style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}>Edit</Link>
                <button className="btn" style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem", color: "#c44", borderColor: "#c44" }} onClick={() => { if (confirm(`Delete "${p.title}"?`)) deletePaper.mutate({ id: p.id }); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Concepts Tab =====

function ConceptsTab({ topicId }: { topicId: string }) {
  const { data: linked, isLoading, refetch } = trpc.concepts.byTopic.useQuery({ topicId });
  const { data: all } = trpc.concepts.list.useQuery();
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const unlink = trpc.concepts.unlinkFromTopic.useMutation({ onSuccess: () => refetch() });
  const link = trpc.concepts.linkToTopic.useMutation({ onSuccess: () => { refetch(); setAdding(false); setSelectedId(""); } });

  const linkedConcepts = (linked ?? []) as unknown as { id: string; term: string; definition: string }[];
  const linkedIds = new Set(linkedConcepts.map((c) => c.id));
  const available = (all ?? []).filter((c) => !linkedIds.has(c.id));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Concept references</h2>
        <button className="btn btn-primary" style={{ fontSize: "0.8rem" }} onClick={() => setAdding(true)}>+ Link concept</button>
      </div>

      {adding && (
        <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 6, padding: "0.875rem 1rem", marginBottom: "1rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <select className="form-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ flex: 1 }}>
            <option value="">Select a concept…</option>
            {available.map((c) => <option key={c.id} value={c.id}>{c.term}</option>)}
          </select>
          <button className="btn btn-primary" disabled={!selectedId || link.isPending} onClick={() => link.mutate({ topicId, conceptId: selectedId })}>Link</button>
          <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
          <Link href="/admin/concepts" className="btn" style={{ fontSize: "0.75rem" }}>Create new ↗</Link>
        </div>
      )}

      {isLoading ? <p style={{ color: "var(--text-muted)" }}>Loading…</p> : !linkedConcepts.length ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No concepts linked yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {linkedConcepts.map((c) => (
            <div key={c.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: 6, padding: "0.75rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: 500, fontSize: "0.9rem" }}>{c.term}</span>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginLeft: "0.75rem" }}>{c.definition.slice(0, 80)}…</span>
              </div>
              <button className="btn" style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }} onClick={() => unlink.mutate({ topicId, conceptId: c.id })}>Unlink</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Quiz Tab =====

function QuizTab({ topicId }: { topicId: string }) {
  const { data: questions, isLoading, refetch } = trpc.quiz.byTopic.useQuery({ topicId });
  const deleteQ = trpc.quiz.delete.useMutation({ onSuccess: () => refetch() });
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Comprehension quiz</h2>
        <button className="btn btn-primary" style={{ fontSize: "0.8rem" }} onClick={() => setCreating(true)} disabled={creating}>+ Add question</button>
      </div>
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
        1–2 fact-based questions (MCQ or True/False). Correct answers required to unlock the AI Thinking Partner.
      </p>

      {creating && <QuizQuestionForm topicId={topicId} onSaved={() => { refetch(); setCreating(false); }} onCancel={() => setCreating(false)} />}

      {isLoading ? <p style={{ color: "var(--text-muted)" }}>Loading…</p> : !(questions as unknown[])?.length ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No questions yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {(questions as { id: string; question_text: string; question_type: string; display_order: number }[]).map((q) => (
            <div key={q.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: 6, padding: "0.875rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginRight: "0.5rem" }}>{q.question_type}</span>
                <span style={{ fontSize: "0.9rem" }}>{q.question_text}</span>
              </div>
              <button className="btn" style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", color: "#c44", borderColor: "#c44", flexShrink: 0, marginLeft: "1rem" }} onClick={() => { if (confirm("Delete this question?")) deleteQ.mutate({ id: q.id }); }}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuizQuestionForm({ topicId, onSaved, onCancel }: { topicId: string; onSaved: () => void; onCancel: () => void }) {
  const [type, setType] = useState<"mcq" | "true_false">("mcq");
  const [questionText, setQuestionText] = useState("");
  const [options, setOptions] = useState([
    { label: "A", text: "" },
    { label: "B", text: "" },
    { label: "C", text: "" },
    { label: "D", text: "" },
  ]);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);

  const create = trpc.quiz.create.useMutation({ onSuccess: onSaved });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      topic_id: topicId,
      question_text: questionText,
      question_type: type,
      options: type === "mcq" ? options.filter((o) => o.text) : undefined,
      correct_answer: correctAnswer,
      explanation: explanation || undefined,
      display_order: displayOrder,
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 6, padding: "1rem", marginBottom: "1rem" }}>
      <div className="form-group">
        <label className="form-label">Question type</label>
        <select className="form-select" value={type} onChange={(e) => { setType(e.target.value as typeof type); setCorrectAnswer(""); }} style={{ maxWidth: 200 }}>
          <option value="mcq">Multiple choice (MCQ)</option>
          <option value="true_false">True / False</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Question</label>
        <textarea className="form-textarea" value={questionText} onChange={(e) => setQuestionText(e.target.value)} required style={{ minHeight: 70 }} />
      </div>
      {type === "mcq" && (
        <div className="form-group">
          <label className="form-label">Options</label>
          {options.map((o, i) => (
            <div key={o.label} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.4rem", alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, minWidth: 20 }}>{o.label}</span>
              <input className="form-input" value={o.text} onChange={(e) => setOptions((prev) => prev.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} placeholder={`Option ${o.label}`} />
            </div>
          ))}
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Correct answer</label>
        {type === "mcq" ? (
          <select className="form-select" value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} required style={{ maxWidth: 120 }}>
            <option value="">Select…</option>
            {options.filter((o) => o.text).map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
          </select>
        ) : (
          <select className="form-select" value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} required style={{ maxWidth: 120 }}>
            <option value="">Select…</option>
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        )}
      </div>
      <div className="form-group">
        <label className="form-label">Explanation — shown after each attempt</label>
        <textarea className="form-textarea" value={explanation} onChange={(e) => setExplanation(e.target.value)} style={{ minHeight: 60 }} />
      </div>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button type="submit" className="btn btn-primary" disabled={create.isPending}>{create.isPending ? "Saving…" : "Save question"}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
