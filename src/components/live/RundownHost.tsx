"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useHostSessionChannel, usePlaySessionChannel } from "@/components/live/useLiveChannels";
import type { LiveBlockAggregate, LiveBlockKind } from "@/types/database";
import type { SpotlightMode } from "@/types/database";
import { useLocale } from "@/i18n/LocaleProvider";
import { BlockEditor, defaultDraft, duplicateFollowUpDrafts, kindLabel, type Draft, type SourceData } from "@/components/live/RundownEditor";

function Bars({ aggregate }: { aggregate?: LiveBlockAggregate }) {
  if (!aggregate?.items?.length) return null;
  const max = Math.max(1, ...aggregate.items.map((i) => i.count ?? i.points ?? 0));
  const before = new Map((aggregate.comparison?.items ?? []).map((item) => [item.id, item.count ?? item.points ?? 0]));
  return <div style={{ display: "grid", gap: "0.65rem", marginTop: "1rem" }}>{aggregate.items.map((item) => { const value = item.count ?? item.points ?? 0; return <div key={item.id}><div style={{ display: "flex", justifyContent: "space-between" }}><span>{item.label}</span><strong>{before.has(item.id) ? `${before.get(item.id)} → ` : ""}{value}</strong></div><div style={{ height: 10, background: "var(--border-light)", borderRadius: 8 }}><div style={{ width: `${value / max * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 8 }} /></div></div>; })}{aggregate.median != null && <p style={{ margin: 0 }}><strong>Median:</strong> {aggregate.median}</p>}</div>;
}

export default function RundownHost({ sessionId, code, topicId, topicTitle, participantCount, ended }: { sessionId: string; code: string; topicId: string; topicTitle: string; participantCount: number; ended: boolean }) {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const rundown = trpc.live.rundown.useQuery({ sessionId }, { refetchInterval: ended ? false : 5000 });
  const sources = trpc.live.blockSources.useQuery({ topicId });
  const current = trpc.live.currentBlock.useQuery({ sessionId }, { refetchInterval: ended ? false : 3000 });
  const run = current.data;
  const aggregate = trpc.live.blockAggregate.useQuery({ runId: run?.run_id ?? "" }, { enabled: !!run?.run_id && !["text", "video", "open_text"].includes(run.snapshot.kind), retry: false, refetchInterval: ended ? false : 3000 });
  const leaderboard = trpc.live.blockLeaderboard.useQuery({ sessionId }, { enabled: !!run && run.snapshot.kind === "quiz" && run.status === "revealed" && run.snapshot.config.leaderboard === true, retry: false });
  const candidates = trpc.live.shareCandidates.useQuery({ runId: run?.run_id ?? "" }, { enabled: !!run?.run_id && ["choice", "open_text", "word_cloud"].includes(run.snapshot.kind), refetchInterval: ended ? false : 3000 });
  const spotlight = trpc.live.currentSpotlight.useQuery({ sessionId }, { enabled: !ended && !!run, retry: false, refetchInterval: ended ? false : 4000 });
  const drawHistory = trpc.live.drawHistory.useQuery({ sessionId }, { enabled: !ended && !!run, retry: false });
  const refresh = () => { rundown.refetch(); current.refetch(); aggregate.refetch(); leaderboard.refetch(); candidates.refetch(); spotlight.refetch(); drawHistory.refetch(); };
  usePlaySessionChannel(sessionId, !ended, refresh);
  useHostSessionChannel(sessionId, !ended, refresh);
  const activate = trpc.live.activateBlock.useMutation({ onSuccess: refresh });
  const revisit = trpc.live.revisitBlock.useMutation({ onSuccess: refresh });
  const close = trpc.live.closeBlock.useMutation({ onSuccess: refresh });
  const reveal = trpc.live.revealBlock.useMutation({ onSuccess: refresh });
  const replace = trpc.live.replaceRundown.useMutation({ onSuccess: refresh });
  const skip = trpc.live.skipBlock.useMutation({ onSuccess: refresh });
  const publish = trpc.live.publishBlockResponse.useMutation({ onSuccess: refresh });
  const removePublication = trpc.live.removeBlockPublication.useMutation({ onSuccess: refresh });
  const draw = trpc.live.draw.useMutation({ onSuccess: refresh });
  const clearDraw = trpc.live.clearDraw.useMutation({ onSuccess: refresh });
  const endSession = trpc.live.endRundown.useMutation({ onSuccess: () => utils.live.bySessionId.invalidate({ sessionId }) });
  const blocks = rundown.data?.blocks ?? [];
  const runs = rundown.data?.runs ?? [];
  const upcoming = blocks.filter((b) => !b.activated_at);
  const next = upcoming.find((b) => !b.skipped_at);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draggedDraft, setDraggedDraft] = useState<number | null>(null);
  const [drawMode, setDrawMode] = useState<SpotlightMode>("no_repeat");
  useEffect(() => {
    if (!editing) setDrafts(upcoming.map((b) => ({ localId: b.id, kind: b.kind, title: b.title, prompt: b.prompt, config: b.config, content: b.content, sourceType: (b.source_type as Draft["sourceType"]) ?? null, sourceId: b.source_id, comparisonGroupId: b.comparison_group_id, skipped: !!b.skipped_at })));
  }, [editing, upcoming.map((b) => `${b.id}:${b.updated_at}:${b.skipped_at}`).join("|")]);
  const activeBlock = blocks.find((b) => b.id === run?.block_id);
  const latestRun = runs.length ? runs.reduce((latest, item) => item.run_number > latest.run_number ? item : latest) : null;
  const isContent = run && (run.snapshot.kind === "text" || run.snapshot.kind === "video");
  const isPublished = (responseId: string) => run?.publications.some((p) => p.response_id === responseId);
  const wordCounts = useMemo(() => {
    const map = new Map<string, number>(); run?.publications.forEach((p) => ((p.answer.entries as string[] | undefined) ?? []).forEach((entry) => map.set(entry, (map.get(entry) ?? 0) + 1))); return map;
  }, [run?.publications]);
  const moveDraft = (index: number, delta: number) => setDrafts((currentDrafts) => {
    const target = index + delta;
    if (target < 0 || target >= currentDrafts.length) return currentDrafts;
    const nextDrafts = [...currentDrafts];
    [nextDrafts[index], nextDrafts[target]] = [nextDrafts[target], nextDrafts[index]];
    return nextDrafts;
  });
  const saveDrafts = () => replace.mutate({ sessionId, blocks: drafts.map(({ localId: _localId, ...draft }) => draft) });
  if (rundown.isLoading || current.isLoading) return <p>Loading rundown…</p>;
  const operationError = rundown.error ?? current.error ?? activate.error ?? revisit.error ?? close.error ?? reveal.error ?? skip.error ?? publish.error ?? removePublication.error ?? endSession.error;
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", marginBottom: "1.25rem" }}>
        <div><p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.75rem" }}>{topicTitle}</p><strong>Join code {code}</strong> · {participantCount} participants</div>
        {!ended && <button className="btn" onClick={() => endSession.mutate({ sessionId })}>{t("live.rundown.host.end")}</button>}
      </header>
      {operationError && <div className="auth-error" role="alert"><p>{t("live.rundown.host.conflict")}</p><button className="btn" onClick={refresh}>{t("live.rundown.participant.retry")}</button></div>}
      {ended ? <div style={{ textAlign: "center", padding: "4rem" }}><h1>{t("live.rundown.host.ended")}</h1></div> : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: "1.25rem" }}>
          <main style={{ minHeight: 420, border: "1px solid var(--border-light)", borderRadius: 14, padding: "1.5rem", background: "var(--bg-surface)" }}>
            {!run && <div style={{ textAlign: "center", padding: "3rem 1rem" }}><h1>{t("live.rundown.host.ready")}</h1><p style={{ color: "var(--text-secondary)" }}>{t("live.rundown.host.readyBody")}</p>{next && <button className="btn btn-primary" onClick={() => activate.mutate({ sessionId, blockId: next.id, requestId: crypto.randomUUID() })}>{t("live.rundown.host.start")}</button>}</div>}
            {run && <>
              <p style={{ color: "var(--accent)", fontWeight: 700 }}>{run.snapshot.title || run.snapshot.kind.replace("_", " ")}</p>
              {run.snapshot.kind === "text" && <div style={{ whiteSpace: "pre-wrap", fontSize: "1.25rem", lineHeight: 1.7 }}>{String(run.snapshot.content.body ?? "")}</div>}
              {run.snapshot.kind === "video" && <div><div style={{ aspectRatio: "16/9" }}><iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${String(run.snapshot.content.youtube_id ?? "")}?rel=0`} title={run.snapshot.title || "Lesson video"} allowFullScreen /></div><p>{String(run.snapshot.content.context ?? "")}</p></div>}
              {!isContent && <h1 style={{ fontSize: "1.7rem", lineHeight: 1.35 }}>{run.snapshot.prompt}</h1>}
              <p style={{ color: "var(--text-muted)" }}>{t("live.rundown.host.responses", { count: run.response_count, status: run.status })}</p>
              {(run.status === "revealed" || String(run.snapshot.config.audience_results) === "live") && <Bars aggregate={aggregate.data} />}
              {run.snapshot.kind === "open_text" && <div style={{ display: "grid", gap: "0.5rem" }}>{run.publications.map((p) => <blockquote key={p.publication_id} style={{ margin: 0, padding: "0.75rem", border: "1px solid var(--border-light)", borderRadius: 8 }}>{p.text}<footer>{p.display_name ?? "Anonymous"} <button className="live-chip" onClick={() => removePublication.mutate({ publicationId: p.publication_id })}>Remove</button></footer></blockquote>)}</div>}
              {run.snapshot.kind === "word_cloud" && <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem", justifyContent: "center" }}>{[...wordCounts.entries()].map(([word, count]) => <span key={word} style={{ fontSize: `${1 + count * 0.3}rem`, fontWeight: 700 }}>{word}</span>)}</div>}
              {aggregate.data?.correct_answer && <p><strong>Correct:</strong> {aggregate.data.correct_answer}</p>}
              {aggregate.data?.explanation && <p>{aggregate.data.explanation}</p>}
              {!!leaderboard.data?.length && <ol>{leaderboard.data.map((row) => <li key={row.user_id}>{row.display_name} — {row.total_score}</li>)}</ol>}
              {!isContent && <section style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border-light)", paddingTop: "1rem" }}><h3>Spotlight a participant</h3>{spotlight.data && <p style={{ fontSize: "1.2rem", fontWeight: 700 }}>{spotlight.data.drawn_display_name ?? "Participant passed"} · {spotlight.data.outcome}</p>}<div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}><select className="form-input" style={{ width: "auto" }} value={drawMode} onChange={(e) => setDrawMode(e.target.value as SpotlightMode)}><option value="uniform">Random</option><option value="no_repeat">No repeats</option>{run.snapshot.kind === "choice" && <><option value="minority_weighted">Favor minority</option><option value="minority_steelman">Minority steelman</option></>}</select><button className="btn" disabled={draw.isPending} onClick={() => draw.mutate({ sessionId, mode: drawMode })}>Draw</button>{spotlight.data && <button className="btn" onClick={() => clearDraw.mutate({ sessionId })}>Clear</button>}</div>{draw.error && <p className="auth-error">{draw.error.message}</p>}</section>}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
                {run.status === "active" && <button className="btn" onClick={() => close.mutate({ sessionId, runId: run.run_id })}>{isContent ? t("live.rundown.host.complete") : t("live.rundown.host.close")}</button>}
                {!isContent && run.status !== "revealed" && <button className="btn btn-primary" onClick={() => reveal.mutate({ sessionId, runId: run.run_id })}>{t("live.rundown.host.reveal")}</button>}
                {next && <button className="btn btn-primary" onClick={() => activate.mutate({ sessionId, blockId: next.id, requestId: crypto.randomUUID() })}>{t("live.rundown.host.next")}</button>}
                {activeBlock && <button className="btn" onClick={() => activate.mutate({ sessionId, blockId: activeBlock.id, rerun: true, requestId: crypto.randomUUID() })}>{t("live.rundown.host.rerun")}</button>}
                {latestRun && latestRun.id !== run.run_id && <button className="btn" onClick={() => revisit.mutate({ sessionId, runId: latestRun.id })}>{t("live.rundown.host.latest")}</button>}
              </div>
              {!!candidates.data?.length && <section style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border-light)", paddingTop: "1rem" }}><h3>{t("live.rundown.host.consentPool")}</h3>{candidates.data.map((candidate: { response_id: string; text_response: string | null; answer: Record<string, unknown>; display_name: string | null; published: boolean }) => <div key={candidate.response_id} style={{ display: "flex", gap: "0.5rem", padding: "0.5rem 0", alignItems: "center" }}><span style={{ flex: 1 }}>{candidate.text_response || ((candidate.answer as { entries?: string[] }).entries ?? []).join(", ")} <small>— {candidate.display_name ?? t("live.rundown.anonymous")}</small></span>{candidate.published || isPublished(candidate.response_id) ? <span>Published</span> : <button className="live-chip" onClick={() => publish.mutate({ responseId: candidate.response_id, displayOrder: run.publications.length })}>Publish</button>}</div>)}</section>}
            </>}
          </main>
          <aside style={{ border: "1px solid var(--border-light)", borderRadius: 14, padding: "1rem", alignSelf: "start" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2 style={{ fontSize: "0.9rem" }}>Rundown</h2><button className="live-chip" onClick={() => setEditing(!editing)}>{editing ? t("common.cancel") : t("live.rundown.host.editUpcoming")}</button></div>
            {!editing && <div style={{ display: "grid", gap: "0.45rem" }}>{blocks.map((block) => { const blockRuns = runs.filter((r) => r.block_id === block.id); return <div key={block.id} style={{ padding: "0.55rem", borderRadius: 8, opacity: block.skipped_at ? 0.55 : 1, background: block.id === run?.block_id ? "var(--accent-soft)" : "var(--bg-subtle)" }}><strong>{block.position + 1}. {block.title || block.kind}{block.skipped_at ? ` · ${t("live.rundown.host.skip")}` : ""}</strong><div style={{ display: "flex", gap: "0.3rem", marginTop: "0.35rem", flexWrap: "wrap" }}>{blockRuns.map((r) => <button key={r.id} className="live-chip" onClick={() => revisit.mutate({ sessionId, runId: r.id })}>Run {r.run_number}</button>)}{!block.activated_at && !block.skipped_at && <><button className="live-chip" onClick={() => activate.mutate({ sessionId, blockId: block.id, requestId: crypto.randomUUID() })}>{t("live.rundown.host.present")}</button><button className="live-chip" onClick={() => skip.mutate({ sessionId, blockId: block.id })}>{t("live.rundown.host.skip")}</button></>}</div></div>; })}</div>}
            {editing && <div role="list" style={{ display: "grid", gap: "0.75rem" }}>
              {drafts.map((draft, index) => <section role="listitem" aria-grabbed={draggedDraft === index} key={draft.localId} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedDraft != null && draggedDraft !== index) moveDraft(draggedDraft, index - draggedDraft); setDraggedDraft(null); }} style={{ borderTop: "1px solid var(--border-light)", paddingTop: "0.65rem", opacity: draggedDraft === index ? 0.65 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}><button type="button" draggable className="live-icon-btn" aria-label={t("live.rundown.action.drag")} onDragStart={() => setDraggedDraft(index)} onDragEnd={() => setDraggedDraft(null)}>⋮⋮</button><strong style={{ flex: 1 }}>{index + 1}. {kindLabel[draft.kind]}</strong><button className="live-icon-btn" aria-label={t("live.rundown.action.moveUp")} disabled={index === 0} onClick={() => moveDraft(index,-1)}>↑</button><button className="live-icon-btn" aria-label={t("live.rundown.action.moveDown")} disabled={index === drafts.length-1} onClick={() => moveDraft(index,1)}>↓</button>{(draft.kind === "choice" || draft.kind === "scale") && <button type="button" className="live-chip" onClick={() => setDrafts(duplicateFollowUpDrafts(drafts, index))}>{t("live.rundown.action.followUp")}</button>}<button className="live-icon-btn" aria-label={t("live.rundown.action.delete")} onClick={() => setDrafts(drafts.filter((item) => item.localId !== draft.localId))}>✕</button></div>
                <BlockEditor draft={draft} sources={sources.data as SourceData | undefined} update={(nextDraft) => setDrafts(drafts.map((item) => item.localId === draft.localId ? nextDraft : item))} />
              </section>)}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>{(Object.keys(kindLabel) as LiveBlockKind[]).map((kind) => <button key={kind} className="live-chip" onClick={() => setDrafts([...drafts, defaultDraft(kind)])}>+ {kindLabel[kind]}</button>)}</div>
              <button className="btn btn-primary" disabled={replace.isPending} onClick={saveDrafts}>{t("live.rundown.host.saveUpcoming")}</button>{replace.error && <p className="auth-error">{replace.error.message}</p>}
            </div>}
          </aside>
        </div>
      )}
    </div>
  );
}
