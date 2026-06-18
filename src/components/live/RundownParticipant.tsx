"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { usePlaySessionChannel } from "@/components/live/useLiveChannels";
import type { CurrentLiveBlock, LiveBlockAggregate, LiveBlockOption, LiveResponseShareScope } from "@/types/database";
import SpotlightCallout from "@/components/live/SpotlightCallout";
import SpotlightOtherView from "@/components/live/SpotlightOtherView";
import { useLocale } from "@/i18n/LocaleProvider";

function Results({ aggregate, current }: { aggregate?: LiveBlockAggregate; current: CurrentLiveBlock }) {
  const { t } = useLocale();
  const kind = current.snapshot.kind;
  const items = aggregate?.items ?? [];
  if (kind === "open_text") return (
    <div style={{ display: "grid", gap: "0.65rem" }}>{current.publications.map((p) => (
      <blockquote key={p.publication_id} style={{ margin: 0, padding: "0.8rem", border: "1px solid var(--border-light)", borderRadius: 10 }}>
        {p.text}<footer style={{ marginTop: "0.35rem", color: "var(--text-muted)", fontSize: "0.78rem" }}>{p.display_name ?? t("live.rundown.anonymous")}</footer>
      </blockquote>
    ))}</div>
  );
  if (kind === "word_cloud") {
    const counts = new Map<string, number>();
    current.publications.forEach((p) => ((p.answer.entries as string[] | undefined) ?? []).forEach((entry) => counts.set(entry, (counts.get(entry) ?? 0) + 1)));
    const max = Math.max(1, ...counts.values());
    return <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem", justifyContent: "center", padding: "1rem" }}>{[...counts.entries()].map(([word, count]) => <span key={word} style={{ fontSize: `${0.9 + 1.5 * count / max}rem`, fontWeight: 700 }}>{word}</span>)}</div>;
  }
  if (!aggregate) return null;
  const max = Math.max(1, ...items.map((item) => item.count ?? item.points ?? 0));
  return (
    <div style={{ display: "grid", gap: "0.6rem" }}>
      {items.map((item) => {
        const value = item.count ?? item.points ?? 0;
        return <div key={item.id}><div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}><span>{item.label}</span><strong>{value}</strong></div><div style={{ height: 8, background: "var(--border-light)", borderRadius: 9 }}><div style={{ width: `${value / max * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 9 }} /></div></div>;
      })}
      {aggregate.correct_answer && <p><strong>{t("live.rundown.results.correctAnswer")}</strong> {aggregate.correct_answer}</p>}
      {aggregate.explanation && <p style={{ color: "var(--text-secondary)" }}>{aggregate.explanation}</p>}
    </div>
  );
}

export default function RundownParticipant({ sessionId, topicTitle, ended }: { sessionId: string; topicTitle: string; ended: boolean }) {
  const { t } = useLocale();
  const currentQuery = trpc.live.currentBlock.useQuery({ sessionId }, { retry: false, refetchInterval: ended ? false : 5000 });
  const current = currentQuery.data ?? null;
  const spotlightQuery = trpc.live.currentSpotlight.useQuery({ sessionId }, { enabled: !ended, retry: false, refetchInterval: ended ? false : 5000 });
  const passDraw = trpc.live.passDraw.useMutation({ onSuccess: () => spotlightQuery.refetch() });
  const shareDraw = trpc.live.shareDraw.useMutation({ onSuccess: () => spotlightQuery.refetch() });
  const visibility = String(current?.snapshot.config.audience_results ?? "on_reveal");
  const showResults = !!current && (current.status === "revealed" || visibility === "live") && visibility !== "never";
  const aggregateQuery = trpc.live.blockAggregate.useQuery({ runId: current?.run_id ?? "" }, { enabled: !!current?.run_id && showResults && !["text", "video", "open_text", "word_cloud"].includes(current.snapshot.kind), retry: false, refetchInterval: visibility === "live" ? 3000 : false });
  usePlaySessionChannel(sessionId, !ended, () => { currentQuery.refetch(); aggregateQuery.refetch(); spotlightQuery.refetch(); });
  const submit = trpc.live.submitBlockResponse.useMutation({ onSuccess: () => currentQuery.refetch() });
  const setScope = trpc.live.setBlockResponseShareScope.useMutation({ onSuccess: () => currentQuery.refetch() });
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [entries, setEntries] = useState(["", "", ""]);
  const [scale, setScale] = useState(1);
  const [ranking, setRanking] = useState<string[]>([]);
  const [scope, setScopeState] = useState<LiveResponseShareScope>("private");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!current?.accepting_until || current.status !== "active") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [current?.accepting_until, current?.status]);
  useEffect(() => {
    const config = current?.snapshot.config ?? {};
    const options = (config.options ?? []) as LiveBlockOption[];
    const mine = current?.my_response;
    setSelected(((mine?.answer.selections as string[] | undefined) ?? (mine?.answer.answer ? [String(mine.answer.answer)] : [])));
    setText(mine?.text_response ?? "");
    setEntries((mine?.answer.entries as string[] | undefined) ?? ["", "", ""]);
    setScale(Number(mine?.answer.value ?? config.min ?? 1));
    setRanking((mine?.answer.ranking as string[] | undefined) ?? options.map((o) => o.id));
    setScopeState(mine?.share_scope ?? "private");
  }, [current?.run_id, current?.my_response?.updated_at]);
  const options = useMemo(() => ((current?.snapshot.config.options ?? []) as LiveBlockOption[]), [current?.snapshot.config.options]);
  if (ended) return <div style={{ textAlign: "center", paddingTop: "3rem" }}><h2>{t("live.rundown.participant.ended")}</h2><p style={{ color: "var(--text-secondary)" }}>{t("live.rundown.participant.thanks")}</p></div>;
  if (currentQuery.isLoading) return <p style={{ color: "var(--text-muted)" }}>{t("live.rundown.participant.loading")}</p>;
  if (currentQuery.error) return <div className="auth-error" role="alert"><p>{t("live.rundown.participant.syncError")}</p><button className="btn" onClick={() => currentQuery.refetch()}>{t("live.rundown.participant.retry")}</button></div>;
  if (!current) return <div style={{ textAlign: "center", paddingTop: "3rem" }}><h2>{t("live.rundown.participant.joined")}</h2><p style={{ color: "var(--text-secondary)" }}>{t("live.rundown.participant.waiting")}</p></div>;
  const { snapshot } = current;
  const spotlight = spotlightQuery.data;
  const alreadySubmitted = !!current.my_response;
  const secondsLeft = current.accepting_until ? Math.max(0, Math.ceil((new Date(current.accepting_until).getTime() - now) / 1000)) : null;
  const canRespond = current.status === "active" && secondsLeft !== 0 && !(alreadySubmitted && snapshot.kind === "quiz");
  const toggle = (id: string) => {
    const max = Number(snapshot.config.max_selections ?? 1);
    if (max === 1) setSelected([id]);
    else setSelected((value) => value.includes(id) ? value.filter((x) => x !== id) : value.length < max ? [...value, id] : value);
  };
  const submitResponse = () => {
    let answer: Record<string, unknown> = {};
    let responseText: string | null = null;
    if (snapshot.kind === "choice") { answer = { selections: selected }; responseText = text.trim() || null; }
    if (snapshot.kind === "open_text") responseText = text.trim();
    if (snapshot.kind === "word_cloud") answer = { entries: entries.map((x) => x.trim()).filter(Boolean) };
    if (snapshot.kind === "scale") answer = { value: scale };
    if (snapshot.kind === "ranking") answer = { ranking: ranking.slice(0, Number(snapshot.config.required_count ?? ranking.length)) };
    if (snapshot.kind === "quiz") answer = { answer: selected[0] };
    submit.mutate({ runId: current.run_id, answer, text: responseText, shareScope: scope });
  };
  const responseReady = snapshot.kind === "choice" || snapshot.kind === "quiz" ? selected.length > 0 : snapshot.kind === "open_text" ? !!text.trim() : snapshot.kind === "word_cloud" ? entries.some((x) => x.trim()) : true;
  const textual = snapshot.kind === "open_text" || snapshot.kind === "word_cloud" || (snapshot.kind === "choice" && String(snapshot.config.allow_note) !== "false" && !!text.trim());
  return (
    <div className="page-narrow" style={{ maxWidth: 560 }}>
      <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase" }}>{topicTitle}</p>
      {snapshot.title && <p style={{ color: "var(--accent)", fontWeight: 700, marginTop: "0.5rem" }}>{snapshot.title}</p>}
      {spotlight && (spotlight.is_you && spotlight.outcome === "pending" ? <SpotlightCallout spotlight={spotlight} raffleMode={false} busy={passDraw.isPending || shareDraw.isPending} errorMessage={passDraw.error?.message || shareDraw.error?.message || undefined} onShare={(shareNote) => shareDraw.mutate({ drawId: spotlight.draw_id, shareNote })} onPass={() => passDraw.mutate({ drawId: spotlight.draw_id })} /> : !spotlight.is_you ? <SpotlightOtherView spotlight={spotlight} /> : null)}
      {snapshot.kind === "text" && <div style={{ whiteSpace: "pre-wrap", fontSize: "1.08rem", lineHeight: 1.7 }}>{String(snapshot.content.body ?? "")}</div>}
      {snapshot.kind === "video" && <div><h2>{snapshot.title}</h2><p style={{ color: "var(--text-secondary)" }}>{String(snapshot.content.context ?? t("live.rundown.participant.watchScreen"))}</p><a href={`https://youtu.be/${snapshot.content.youtube_id}`} target="_blank" rel="noreferrer">{t("live.rundown.participant.openVideo")}</a></div>}
      {!(["text", "video"] as string[]).includes(snapshot.kind) && <h1 style={{ fontSize: "1.35rem", lineHeight: 1.4, margin: "1rem 0" }}>{snapshot.prompt}</h1>}
      {secondsLeft != null && <p style={{ color: secondsLeft <= 5 ? "var(--danger)" : "var(--text-muted)", fontWeight: 700 }}>{t("live.rundown.timer", { seconds: secondsLeft })}</p>}
      {canRespond && (
        <div style={{ display: "grid", gap: "0.65rem" }}>
          {(snapshot.kind === "choice" || snapshot.kind === "quiz") && options.map((option) => <button key={option.id} type="button" className={`live-option-btn${selected.includes(option.id) ? " selected" : ""}`} onClick={() => toggle(option.id)}>{option.label}</button>)}
          {snapshot.kind === "quiz" && snapshot.config.question_type === "true_false" && ["true", "false"].map((id) => <button key={id} type="button" className={`live-option-btn${selected.includes(id) ? " selected" : ""}`} onClick={() => setSelected([id])}>{id === "true" ? t("live.rundown.participant.true") : t("live.rundown.participant.false")}</button>)}
          {snapshot.kind === "choice" && String(snapshot.config.allow_note) !== "false" && <textarea className="form-textarea" maxLength={280} rows={3} placeholder={t("live.rundown.participant.notePlaceholder")} value={text} onChange={(e) => setText(e.target.value)} />}
          {snapshot.kind === "open_text" && <textarea className="form-textarea" maxLength={Number(snapshot.config.max_length ?? 500)} rows={5} placeholder={t("live.rundown.participant.responsePlaceholder")} value={text} onChange={(e) => setText(e.target.value)} />}
          {snapshot.kind === "word_cloud" && entries.slice(0, Number(snapshot.config.max_entries ?? 3)).map((entry, i) => <input key={i} className="form-input" maxLength={40} placeholder={t("live.rundown.participant.wordPlaceholder", { number: i + 1 })} value={entry} onChange={(e) => setEntries(entries.map((x, j) => i === j ? e.target.value : x))} />)}
          {snapshot.kind === "scale" && <div><input type="range" min={Number(snapshot.config.min ?? 1)} max={Number(snapshot.config.max ?? 5)} value={scale} onChange={(e) => setScale(Number(e.target.value))} style={{ width: "100%" }} /><div style={{ display: "flex", justifyContent: "space-between" }}><span>{String(snapshot.config.min_label ?? snapshot.config.min ?? 1)}</span><strong>{scale}</strong><span>{String(snapshot.config.max_label ?? snapshot.config.max ?? 5)}</span></div></div>}
          {snapshot.kind === "ranking" && ranking.map((id, i) => { const option = options.find((o) => o.id === id); return <div key={id} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}><strong>{i + 1}</strong><span style={{ flex: 1 }}>{option?.label}</span><button className="live-icon-btn" onClick={() => i > 0 && setRanking(ranking.map((x, j) => j === i - 1 ? id : j === i ? ranking[i - 1] : x))}>↑</button><button className="live-icon-btn" onClick={() => i < ranking.length - 1 && setRanking(ranking.map((x, j) => j === i + 1 ? id : j === i ? ranking[i + 1] : x))}>↓</button></div>; })}
          {textual && <label className="form-label">{t("live.rundown.consent.label")}<select className="form-input" value={scope} onChange={(e) => setScopeState(e.target.value as LiveResponseShareScope)}><option value="private">{t("live.rundown.consent.private")}</option><option value="anonymous">{t("live.rundown.consent.anonymous")}</option><option value="named">{t("live.rundown.consent.named")}</option></select></label>}
          {submit.error && <p className="auth-error">{submit.error.message}</p>}
          <button className="btn btn-primary" disabled={!responseReady || submit.isPending} onClick={submitResponse}>{submit.isPending ? t("live.rundown.participant.submitting") : alreadySubmitted ? t("live.rundown.participant.update") : t("live.rundown.participant.submit")}</button>
        </div>
      )}
      {alreadySubmitted && current.my_response && <div style={{ padding: "0.9rem", borderRadius: 10, background: "var(--bg-surface)", marginBottom: "1rem" }}><strong>{t("live.rundown.participant.recorded")}</strong>{["choice","open_text","word_cloud"].includes(snapshot.kind) && <label className="form-label" style={{ display: "block", marginTop: "0.7rem" }}>{t("live.rundown.consent.label")}<select className="form-input" value={current.my_response.share_scope} onChange={(e) => setScope.mutate({ responseId: current.my_response!.id, shareScope: e.target.value as LiveResponseShareScope })}><option value="private">{t("live.rundown.consent.private")}</option><option value="anonymous">{t("live.rundown.consent.anonymous")}</option><option value="named">{t("live.rundown.consent.named")}</option></select></label>}</div>}
      {setScope.error && <p className="auth-error" role="alert">{t("live.rundown.participant.consentError")}</p>}
      {secondsLeft === 0 && current.status === "active" && <p style={{ color: "var(--text-muted)" }}>{t("live.rundown.participant.timerClosed")}</p>}
      {current.status === "closed" && !showResults && <p style={{ color: "var(--text-muted)" }}>{t("live.rundown.participant.closed")}</p>}
      {showResults && <Results aggregate={aggregateQuery.data} current={current} />}
    </div>
  );
}
