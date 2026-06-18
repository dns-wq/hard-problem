"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import type { LiveBlockKind } from "@/types/database";
import { useLocale } from "@/i18n/LocaleProvider";

export type Draft = {
  localId: string;
  kind: LiveBlockKind;
  title: string;
  prompt: string;
  config: Record<string, unknown>;
  content: Record<string, unknown>;
  sourceType?: "custom" | "topic_prompt" | "topic_anchor" | "paper_excerpt" | "topic_video" | "quiz_bank" | null;
  sourceId?: string | null;
  comparisonGroupId?: string | null;
};

export type SourceData = {
  topic: { discussion_prompt?: string; framing_note?: string; real_world_anchor?: { title?: string; body?: string; source_url?: string }; videos?: Array<{ youtube_id: string; title: string; speaker?: string; note?: string }> };
  papers: Array<{ id: string; title: string; abstract: string | null }>;
  quizzes: Array<{ id: string; question_text: string; question_type: "mcq" | "true_false"; options: Array<{ label: string; text: string }> | null; correct_answer: string; explanation: string | null }>;
};

let draftSequence = 0;
const uid = () => `draft-${Date.now()}-${draftSequence++}`;
const optionId = () => `option-${Date.now()}-${draftSequence++}`;

export function defaultDraft(kind: LiveBlockKind, prompt = ""): Draft {
  const base = { localId: uid(), kind, title: "", prompt, content: {}, sourceType: "custom" as const };
  switch (kind) {
    case "text": return { ...base, config: {}, content: { body: prompt || "Add instructions or lesson context." } };
    case "video": return { ...base, config: {}, content: { youtube_id: "", context: "" } };
    case "choice": return { ...base, config: { options: [{ id: optionId(), label: "Option 1" }, { id: optionId(), label: "Option 2" }], max_selections: 1, allow_note: true, audience_results: "on_reveal" } };
    case "open_text": return { ...base, config: { max_length: 500, audience_results: "on_reveal" } };
    case "word_cloud": return { ...base, config: { max_entries: 3, max_entry_length: 40, audience_results: "on_reveal" } };
    case "scale": return { ...base, config: { min: 1, max: 5, min_label: "", max_label: "", audience_results: "on_reveal" } };
    case "ranking": return { ...base, config: { options: [{ id: optionId(), label: "Item 1" }, { id: optionId(), label: "Item 2" }], required_count: 2, audience_results: "on_reveal" } };
    case "quiz": return { ...base, config: { question_type: "true_false", correct_answer: "true", explanation: "", leaderboard: false, answer_window_sec: 20, audience_results: "on_reveal" } };
  }
}

export const kindLabel: Record<LiveBlockKind, string> = {
  text: "Text / instructions", video: "Lesson video", choice: "Choice / stance", open_text: "Open response",
  word_cloud: "Word cloud", scale: "Scale", ranking: "Ranking", quiz: "Quiz",
};

function OptionsEditor({ draft, update }: { draft: Draft; update: (next: Draft) => void }) {
  const options = (draft.config.options ?? []) as Array<{ id: string; label: string }>;
  const setOptions = (next: typeof options) => update({ ...draft, config: { ...draft.config, options: next, ...(draft.kind === "ranking" ? { required_count: Math.min(Number(draft.config.required_count ?? next.length), next.length) } : {}) } });
  return (
    <div style={{ display: "grid", gap: "0.4rem" }}>
      {options.map((option, index) => (
        <div key={option.id} style={{ display: "flex", gap: "0.4rem" }}>
          <input className="form-input" value={option.label} onChange={(e) => setOptions(options.map((o, i) => i === index ? { ...o, label: e.target.value } : o))} />
          <button type="button" className="live-icon-btn" onClick={() => setOptions(options.filter((_, i) => i !== index))} disabled={options.length <= 2}>✕</button>
        </div>
      ))}
      <button type="button" className="live-chip" onClick={() => setOptions([...options, { id: optionId(), label: `${draft.kind === "ranking" ? "Item" : "Option"} ${options.length + 1}` }])} disabled={options.length >= 8}>+ Add option</button>
    </div>
  );
}

export function BlockEditor({ draft, sources, update }: { draft: Draft; sources?: SourceData; update: (next: Draft) => void }) {
  const setConfig = (patch: Record<string, unknown>) => update({ ...draft, config: { ...draft.config, ...patch } });
  const audience = String(draft.config.audience_results ?? "on_reveal");
  return (
    <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
      <input className="form-input" placeholder="Optional block title" value={draft.title} maxLength={120} onChange={(e) => update({ ...draft, title: e.target.value })} />
      {draft.kind !== "text" && draft.kind !== "video" && (
        <textarea className="form-textarea" placeholder="Question or prompt" value={draft.prompt} maxLength={500} rows={2} onChange={(e) => update({ ...draft, prompt: e.target.value })} />
      )}
      {draft.kind === "text" && (
        <>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {sources?.topic.framing_note && <button type="button" className="live-chip" onClick={() => update({ ...draft, title: "Framing", content: { body: sources.topic.framing_note }, sourceType: "custom", sourceId: null })}>Topic framing</button>}
            {sources?.topic.discussion_prompt && <button type="button" className="live-chip" onClick={() => update({ ...draft, title: "Discussion prompt", content: { body: sources.topic.discussion_prompt }, sourceType: "topic_prompt", sourceId: null })}>Discussion prompt</button>}
            {sources?.topic.real_world_anchor?.body && <button type="button" className="live-chip" onClick={() => update({ ...draft, title: sources.topic.real_world_anchor?.title ?? "Real-world anchor", content: { body: sources.topic.real_world_anchor?.body, source_url: sources.topic.real_world_anchor?.source_url }, sourceType: "topic_anchor", sourceId: null })}>Real-world anchor</button>}
            {(sources?.papers ?? []).map((paper) => <button key={paper.id} type="button" className="live-chip" disabled={!paper.abstract} onClick={() => update({ ...draft, title: paper.title, content: { body: paper.abstract ?? "" }, sourceType: "paper_excerpt", sourceId: paper.id })}>{paper.title}</button>)}
          </div>
          <textarea className="form-textarea" value={String(draft.content.body ?? "")} maxLength={4000} rows={6} onChange={(e) => update({ ...draft, content: { ...draft.content, body: e.target.value } })} />
        </>
      )}
      {draft.kind === "video" && (
        <>
          <select className="form-input" value={String(draft.content.youtube_id ?? "")} onChange={(e) => {
            const video = (sources?.topic.videos ?? []).find((v) => v.youtube_id === e.target.value);
            update({ ...draft, title: video?.title ?? draft.title, content: { youtube_id: e.target.value, context: video?.note ?? "", speaker: video?.speaker ?? "" }, sourceType: "topic_video", sourceId: e.target.value });
          }}>
            <option value="">Select a topic video</option>
            {(sources?.topic.videos ?? []).map((v) => <option key={v.youtube_id} value={v.youtube_id}>{v.title}</option>)}
          </select>
          <textarea className="form-textarea" placeholder="Phone companion context" value={String(draft.content.context ?? "")} rows={2} onChange={(e) => update({ ...draft, content: { ...draft.content, context: e.target.value } })} />
        </>
      )}
      {(draft.kind === "choice" || draft.kind === "ranking") && <OptionsEditor draft={draft} update={update} />}
      {draft.kind === "choice" && (
        <><label className="form-label">Maximum selections <input type="number" min={1} max={((draft.config.options as unknown[]) ?? []).length} value={Number(draft.config.max_selections ?? 1)} onChange={(e) => setConfig({ max_selections: Number(e.target.value) })} style={{ width: 64, marginLeft: 8 }} /></label><label className="form-label"><input type="checkbox" checked={draft.config.allow_note !== false} onChange={(e) => setConfig({ allow_note: e.target.checked })} /> Allow a 280-character note</label></>
      )}
      {draft.kind === "ranking" && (
        <label className="form-label">Items each participant ranks <input type="number" min={1} max={((draft.config.options as unknown[]) ?? []).length} value={Number(draft.config.required_count ?? 2)} onChange={(e) => setConfig({ required_count: Number(e.target.value) })} style={{ width: 64, marginLeft: 8 }} /></label>
      )}
      {draft.kind === "scale" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <label className="form-label">Minimum<input className="form-input" type="number" value={Number(draft.config.min ?? 1)} onChange={(e) => setConfig({ min: Number(e.target.value) })} /></label>
          <label className="form-label">Maximum<input className="form-input" type="number" value={Number(draft.config.max ?? 5)} onChange={(e) => setConfig({ max: Number(e.target.value) })} /></label>
          <input className="form-input" placeholder="Minimum label" value={String(draft.config.min_label ?? "")} onChange={(e) => setConfig({ min_label: e.target.value })} />
          <input className="form-input" placeholder="Maximum label" value={String(draft.config.max_label ?? "")} onChange={(e) => setConfig({ max_label: e.target.value })} />
        </div>
      )}
      {draft.kind === "quiz" && (
        <><select className="form-input" value={draft.sourceId ?? ""} onChange={(e) => {
          const quiz = sources?.quizzes.find((q) => q.id === e.target.value);
          if (!quiz) return;
          const options = quiz.question_type === "true_false" ? undefined : (quiz.options ?? []).map((o) => ({ id: o.label, label: o.text }));
          update({ ...draft, prompt: quiz.question_text, sourceType: "quiz_bank", sourceId: quiz.id, config: { question_type: quiz.question_type, ...(options ? { options } : {}), correct_answer: quiz.correct_answer, explanation: quiz.explanation ?? "", leaderboard: false, answer_window_sec: 20, audience_results: "on_reveal" } });
        }}>
          <option value="">Select a quiz-bank question</option>
          {(sources?.quizzes ?? []).map((q) => <option key={q.id} value={q.id}>{q.question_text}</option>)}
        </select><label className="form-label">Answer window (seconds)<input className="form-input" type="number" min={5} max={600} value={Number(draft.config.answer_window_sec ?? 20)} onChange={(e) => setConfig({ answer_window_sec: Number(e.target.value) })} /></label><label className="form-label"><input type="checkbox" checked={draft.config.leaderboard === true} onChange={(e) => setConfig({ leaderboard: e.target.checked })} /> Show leaderboard after reveal</label></>
      )}
      {draft.kind === "open_text" && <label className="form-label">Maximum response length<input className="form-input" type="number" min={1} max={500} value={Number(draft.config.max_length ?? 500)} onChange={(e) => setConfig({ max_length: Number(e.target.value) })} /></label>}
      {draft.kind === "word_cloud" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}><label className="form-label">Entries<input className="form-input" type="number" min={1} max={3} value={Number(draft.config.max_entries ?? 3)} onChange={(e) => setConfig({ max_entries: Number(e.target.value) })} /></label><label className="form-label">Characters each<input className="form-input" type="number" min={1} max={40} value={Number(draft.config.max_entry_length ?? 40)} onChange={(e) => setConfig({ max_entry_length: Number(e.target.value) })} /></label></div>}
      {!(["text", "video", "open_text", "word_cloud", "quiz"] as string[]).includes(draft.kind) && (
        <label className="form-label">Audience results
          <select className="form-input" value={audience} onChange={(e) => setConfig({ audience_results: e.target.value })}>
            <option value="on_reveal">When host reveals</option><option value="live">Live</option><option value="never">Never</option>
          </select>
        </label>
      )}
    </div>
  );
}

export default function RundownEditor({ topic, stanceTags }: { topic: { id: string; slug: string; title: string; discussion_prompt?: string }; stanceTags: Array<{ tag: string }> }) {
  const { t } = useLocale();
  const router = useRouter();
  const sourcesQuery = trpc.live.blockSources.useQuery({ topicId: topic.id });
  const [startsAt, setStartsAt] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const initial = useMemo(() => {
    const draft = defaultDraft("choice", topic.discussion_prompt ?? "");
    const labels = stanceTags.slice(0, 6).map((s) => s.tag);
    if (labels.length >= 2) draft.config.options = labels.map((label) => ({ id: optionId(), label }));
    return draft;
  }, [topic.discussion_prompt, stanceTags]);
  const [blocks, setBlocks] = useState<Draft[]>([initial]);
  const [dragged, setDragged] = useState<number | null>(null);
  const create = trpc.live.create.useMutation({ onSuccess: (s) => router.push(`/live/host/${s.code}`), onError: (e) => setError(e.message) });
  const move = (index: number, delta: number) => setBlocks((current) => {
    const target = index + delta; if (target < 0 || target >= current.length) return current;
    const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next;
  });
  const duplicateFollowUp = (index: number) => {
    const source = blocks[index];
    const group = source.comparisonGroupId ?? crypto.randomUUID();
    const original = { ...source, comparisonGroupId: group };
    const copy = { ...structuredClone(source), localId: uid(), title: source.title ? `${source.title} — follow-up` : "Follow-up", comparisonGroupId: group };
    setBlocks([...blocks.slice(0, index), original, copy, ...blocks.slice(index + 1)]);
  };
  const submit = () => {
    const invalidVideo = blocks.find((b) => b.kind === "video" && !String(b.content.youtube_id ?? ""));
    const invalidText = blocks.find((b) => b.kind === "text" && !String(b.content.body ?? "").trim());
    if (invalidVideo || invalidText) { setError(invalidVideo ? "Select a topic video before creating the session." : "Text blocks cannot be empty."); return; }
    setError("");
    create.mutate({ topicId: topic.id, question: topic.discussion_prompt, options: [], blocks: blocks.map(({ localId: _localId, ...b }) => b), ...(startsAt ? { startsAt: new Date(startsAt).toISOString(), publish: true } : {}) });
  };
  const labels: Record<LiveBlockKind,string> = {
    text: t("live.rundown.kind.text"), video: t("live.rundown.kind.video"), choice: t("live.rundown.kind.choice"),
    open_text: t("live.rundown.kind.openText"), word_cloud: t("live.rundown.kind.wordCloud"), scale: t("live.rundown.kind.scale"),
    ranking: t("live.rundown.kind.ranking"), quiz: t("live.rundown.kind.quiz"),
  };
  return (
    <div className="page-narrow" style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: "1.45rem", fontWeight: 800 }}>{t("live.rundown.build.title")}</h1>
      <p style={{ color: "var(--text-secondary)", margin: "0.4rem 0 1.5rem" }}>{t("live.rundown.build.subtitle", { topic: topic.title })}</p>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {blocks.map((block, index) => (
          <section key={block.localId} draggable onDragStart={() => setDragged(index)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragged != null && dragged !== index) move(dragged, index - dragged); setDragged(null); }} onDragEnd={() => setDragged(null)} style={{ border: "1px solid var(--border-light)", borderRadius: 10, padding: "0.8rem", background: "var(--bg-surface)", opacity: dragged === index ? 0.65 : 1 }}>
            <div style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
              <strong style={{ flex: 1 }}>{index + 1}. {labels[block.kind]}{block.title ? ` — ${block.title}` : ""}</strong>
              <button type="button" className="live-icon-btn" onClick={() => move(index, -1)} disabled={index === 0}>↑</button>
              <button type="button" className="live-icon-btn" onClick={() => move(index, 1)} disabled={index === blocks.length - 1}>↓</button>
              {(block.kind === "choice" || block.kind === "scale") && <button type="button" className="live-chip" onClick={() => duplicateFollowUp(index)}>{t("live.rundown.action.followUp")}</button>}
              <button type="button" className="live-chip" onClick={() => setExpanded(expanded === block.localId ? null : block.localId)}>{expanded === block.localId ? t("live.rundown.action.done") : t("live.rundown.action.edit")}</button>
              <button type="button" className="live-icon-btn" onClick={() => setBlocks(blocks.filter((b) => b.localId !== block.localId))} disabled={blocks.length === 1}>✕</button>
            </div>
            {expanded === block.localId && <BlockEditor draft={block} sources={sourcesQuery.data as SourceData | undefined} update={(next) => setBlocks(blocks.map((b) => b.localId === block.localId ? next : b))} />}
          </section>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginTop: "1rem" }}>
        {(Object.keys(kindLabel) as LiveBlockKind[]).map((kind) => <button key={kind} type="button" className="live-chip" onClick={() => { const next = defaultDraft(kind); setBlocks([...blocks, next]); setExpanded(next.localId); }}>+ {labels[kind]}</button>)}
      </div>
      <label className="form-label" style={{ display: "block", marginTop: "1.5rem" }}>Optional scheduled start
        <input className="form-input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </label>
      {error && <p className="auth-error">{error}</p>}
      <button className="btn btn-primary" style={{ width: "100%", marginTop: "1rem" }} disabled={create.isPending || blocks.length === 0} onClick={submit}>{create.isPending ? t("live.rundown.action.creating") : t("live.rundown.action.create")}</button>
    </div>
  );
}
