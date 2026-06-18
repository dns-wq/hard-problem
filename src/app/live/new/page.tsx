"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useLocale } from "@/i18n/LocaleProvider";
import RundownEditor from "@/components/live/RundownEditor";

interface OptionDraft {
  label: string;
  sourceStanceTag: string | null;
}

function NewSessionForm() {
  const { t } = useLocale();
  const router = useRouter();
  const topicSlug = useSearchParams().get("topic");

  const [question, setQuestion] = useState("");
  const [questionTouched, setQuestionTouched] = useState(false);
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [customLabel, setCustomLabel] = useState("");
  const [formError, setFormError] = useState("");
  const [raffleMode, setRaffleMode] = useState(false);
  const [startsAt, setStartsAt] = useState(""); // datetime-local; empty = start now

  const { data: topic, isLoading, error } = trpc.topics.bySlug.useQuery(
    { slug: topicSlug ?? "" },
    { enabled: !!topicSlug, retry: false },
  );
  const { data: topicList } = trpc.topics.list.useQuery(undefined, { enabled: !topicSlug });
  const { data: stanceTags } = trpc.contributions.stanceTags.useQuery(
    { topicId: topic?.id ?? "" },
    { enabled: !!topic?.id },
  );
  const rundownEnabled = trpc.live.rundownEnabled.useQuery();

  // Prefill the question with the topic's discussion prompt (host-editable)
  useEffect(() => {
    if (topic && !questionTouched) {
      setQuestion(topic.discussion_prompt ?? "");
    }
  }, [topic, questionTouched]);

  const createSession = trpc.live.create.useMutation({
    onSuccess: (session) => router.push(`/live/host/${session.code}`),
    onError: (e) => setFormError(e.message),
  });

  function addOption(label: string, sourceStanceTag: string | null) {
    const trimmed = label.trim();
    if (!trimmed) return;
    if (options.length >= 6) {
      setFormError(t("live.new.error.maxOptions"));
      return;
    }
    if (options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase())) {
      setFormError(t("live.new.error.duplicateOption"));
      return;
    }
    setFormError("");
    setOptions([...options, { label: trimmed, sourceStanceTag }]);
  }

  function moveOption(index: number, delta: number) {
    const next = [...options];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOptions(next);
  }

  // No topic in the URL: lightweight picker instead of a dead end
  if (!topicSlug) {
    return (
      <div className="page-narrow">
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: "0.75rem" }}>{t("live.new.title")}</h1>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
          {t("live.new.picker.hint")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {(topicList ?? []).map((t) => (
            <Link
              key={t.id}
              href={`/live/new?topic=${t.slug}`}
              style={{
                padding: "0.7rem 0.9rem",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-light)",
                borderRadius: 8,
                textDecoration: "none",
                color: "var(--text-primary)",
                fontSize: "0.9rem",
              }}
            >
              {t.title}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="page-narrow">
        <p style={{ color: "var(--text-muted)" }}>{t("common.loading")}</p>
      </div>
    );
  }

  if (error || !topic) {
    return (
      <div className="page-narrow" style={{ textAlign: "center", paddingTop: "4rem" }}>
        <p style={{ color: "var(--text-muted)" }}>{t("live.new.error.topicNotFound")}</p>
        <Link href="/topics" className="btn" style={{ marginTop: "1rem", display: "inline-block", textDecoration: "none" }}>
          {t("nav.allTopics")}
        </Link>
      </div>
    );
  }

  if (rundownEnabled.data && !raffleMode) {
    return (
      <div>
        <label className="page-narrow" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", fontSize: "0.88rem", color: "var(--text-secondary)", cursor: "pointer" }}>
          <input type="checkbox" checked={raffleMode} onChange={(e) => setRaffleMode(e.target.checked)} />
          {t("live.new.raffle.toggleLabel")}
        </label>
        <RundownEditor topic={topic} stanceTags={stanceTags ?? []} />
      </div>
    );
  }

  const suggestions = (stanceTags ?? [])
    .filter((s) => !options.some((o) => o.label.toLowerCase() === s.tag.toLowerCase()))
    .slice(0, 8);
  const canSubmit = (raffleMode || (options.length >= 2 && options.length <= 6)) && !createSession.isPending;

  return (
    <div className="page-narrow">
      <Link href={`/topics/${topic.slug}`} style={{ fontSize: "0.8rem", color: "var(--text-muted)", textDecoration: "none", display: "inline-block", marginBottom: "1.5rem" }}>
        ← {topic.title}
      </Link>

      <h1 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: "1.5rem" }}>{t("live.new.title")}</h1>

      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem", fontSize: "0.88rem", color: "var(--text-secondary)", cursor: "pointer" }}>
        <input type="checkbox" checked={raffleMode} onChange={(e) => setRaffleMode(e.target.checked)} />
        {t("live.new.raffle.toggleLabel")}
      </label>

      {raffleMode && (
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
          {t("live.new.raffle.hint")}
        </p>
      )}

      {!raffleMode && (
        <>
      <div className="form-group">
        <label className="form-label" htmlFor="live-question">{t("live.new.question.label")}</label>
        <textarea
          id="live-question"
          className="form-textarea"
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            setQuestionTouched(true);
          }}
          rows={2}
          maxLength={500}
        />
      </div>

      <div className="form-group">
        <span className="form-label">{t("live.new.options.label")}</span>

        {options.length === 0 && (
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0.25rem 0 0.5rem" }}>
            {t("live.new.options.empty")}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.75rem" }}>
          {options.map((o, i) => (
            <div
              key={o.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.7rem",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-light)",
                borderRadius: 8,
              }}
            >
              <span style={{ flex: 1, fontSize: "0.88rem" }}>{o.label}</span>
              <button type="button" className="live-icon-btn" onClick={() => moveOption(i, -1)} disabled={i === 0} aria-label={t("live.new.option.moveUp")}>↑</button>
              <button type="button" className="live-icon-btn" onClick={() => moveOption(i, 1)} disabled={i === options.length - 1} aria-label={t("live.new.option.moveDown")}>↓</button>
              <button type="button" className="live-icon-btn" onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label={t("live.new.option.remove")}>✕</button>
            </div>
          ))}
        </div>

        {suggestions.length > 0 && (
          <div style={{ marginBottom: "0.75rem" }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block", marginBottom: "0.4rem" }}>
              {t("live.new.suggestions.label")}
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {suggestions.map((s) => (
                <button
                  key={s.tag}
                  type="button"
                  className="live-chip"
                  onClick={() => addOption(s.tag, s.tag)}
                >
                  + {s.tag} ({s.count})
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            className="form-input"
            type="text"
            placeholder={t("live.new.option.placeholder")}
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOption(customLabel, null);
                setCustomLabel("");
              }
            }}
            maxLength={100}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn"
            onClick={() => {
              addOption(customLabel, null);
              setCustomLabel("");
            }}
          >
            {t("live.new.option.addCta")}
          </button>
        </div>
      </div>
        </>
      )}

      <div className="form-group">
        <label className="form-label" htmlFor="live-starts-at">
          {t("live.new.schedule.label")} <span style={{ fontWeight: 400, color: "var(--text-muted)", textTransform: "none" }}>{t("live.new.schedule.labelOptional")}</span>
        </label>
        <input
          id="live-starts-at"
          className="form-input"
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
        {startsAt && (
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            {t("live.new.schedule.hint")}
          </span>
        )}
      </div>

      {formError && <p className="auth-error" style={{ marginBottom: "1rem" }}>{formError}</p>}

      <button
        type="button"
        className="btn btn-primary"
        disabled={!canSubmit}
        onClick={() =>
          createSession.mutate({
            topicId: topic.id,
            question: raffleMode ? undefined : question.trim() || undefined,
            options: raffleMode ? [] : options,
            raffleMode: raffleMode || undefined,
            startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
            publish: startsAt ? true : undefined,
          })
        }
      >
        {createSession.isPending
          ? t("live.new.cta.creating")
          : startsAt
            ? t("live.new.cta.schedule")
            : raffleMode
              ? t("live.new.cta.createRaffle")
              : t("live.new.cta.create")}
      </button>
      {!raffleMode && options.length < 2 && (
        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginLeft: "0.75rem" }}>
          {t("live.new.minOptionsHint", { count: 2 - options.length })}
        </span>
      )}
    </div>
  );
}

// useSearchParams requires a Suspense boundary on statically prerendered pages
// (Next 16 fails the production build without it).
export default function NewSessionPage() {
  const { t } = useLocale();
  return (
    <Suspense fallback={<div className="page-narrow"><p style={{ color: "var(--text-muted)" }}>{t("common.loading")}</p></div>}>
      <NewSessionForm />
    </Suspense>
  );
}
