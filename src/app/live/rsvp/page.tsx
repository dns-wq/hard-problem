"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc/client";
import { useLocale } from "@/i18n/LocaleProvider";

interface RsvpRow {
  session_id: string;
  code: string;
  status: string;
  starts_at: string | null;
  question: string;
}

function RsvpInner() {
  const { t, locale } = useLocale();
  const code = (useSearchParams().get("code") ?? "").toUpperCase();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [rsvpedLocal, setRsvpedLocal] = useState<boolean | null>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        setUser(data.user);
        setAuthChecked(true);
      });
  }, []);

  const byCode = trpc.live.byCode.useQuery({ code }, { enabled: authChecked && !!user && !!code, retry: false });
  const preview = byCode.data;

  const myRsvps = trpc.live.myRsvps.useQuery(undefined, { enabled: authChecked && !!user });
  const myRow = useMemo(
    () => ((myRsvps.data ?? []) as RsvpRow[]).find((r) => r.session_id === preview?.id),
    [myRsvps.data, preview?.id],
  );
  const rsvped = rsvpedLocal ?? !!myRow;

  const rsvp = trpc.live.rsvp.useMutation({
    onSuccess: () => {
      setRsvpedLocal(true);
      myRsvps.refetch();
    },
  });
  const withdraw = trpc.live.withdrawRsvp.useMutation({
    onSuccess: () => {
      setRsvpedLocal(false);
      myRsvps.refetch();
    },
  });

  if (!authChecked || (user && !!code && byCode.isLoading)) {
    return <div className="page-narrow"><p style={{ color: "var(--text-muted)" }}>{t("common.loading")}</p></div>;
  }

  if (!user) {
    return (
      <div className="auth-container" style={{ textAlign: "center" }}>
        <h1 className="auth-title">{t("live.rsvp.signedOut.title")}</h1>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: "1.5rem" }}>
          {t("live.rsvp.signedOut.hint")}
        </p>
        <Link
          href={`/auth/login?redirect=${encodeURIComponent(`/live/rsvp?code=${code}`)}`}
          className="btn btn-primary"
          style={{ display: "inline-block", textDecoration: "none" }}
        >
          {t("live.rsvp.signedOut.cta")}
        </Link>
      </div>
    );
  }

  if (!code || byCode.error || !preview) {
    return (
      <div className="page-narrow" style={{ textAlign: "center", paddingTop: "4rem" }}>
        <p style={{ color: "var(--text-muted)" }}>{byCode.error?.message ?? t("live.error.noSession")}</p>
        <Link href="/live" className="btn" style={{ marginTop: "1rem", display: "inline-block", textDecoration: "none" }}>
          {t("nav.liveSessions")}
        </Link>
      </div>
    );
  }

  const startsAt = preview.starts_at ?? myRow?.starts_at ?? null;
  const error = rsvp.error?.message || withdraw.error?.message;

  return (
    <div className="auth-container" style={{ textAlign: "center" }}>
      <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
        {preview.topic_title}
      </span>
      <h1 style={{ fontSize: "1.3rem", fontWeight: 800, lineHeight: 1.3, margin: "0.4rem 0 1rem" }}>{preview.question}</h1>

      {startsAt && (
        <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
          {new Date(startsAt).toLocaleString(locale, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </p>
      )}

      {error && <p className="auth-error" style={{ marginBottom: "0.75rem" }}>{error}</p>}

      {preview.status !== "lobby" ? (
        <div>
          <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>{t("live.rsvp.alreadyLive")}</p>
          <Link href={`/live/play/${code}`} className="btn btn-primary" style={{ display: "inline-block", textDecoration: "none" }}>
            {t("live.rsvp.joinNow")}
          </Link>
        </div>
      ) : rsvped ? (
        <div>
          <p style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>{t("live.rsvp.confirmed.title")}</p>
          <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center", flexWrap: "wrap" }}>
            <a href={`/api/live/${preview.id}/ics`} className="btn" style={{ textDecoration: "none" }}>
              {t("live.rsvp.addToCalendar")}
            </a>
            <button type="button" className="btn" disabled={withdraw.isPending} onClick={() => withdraw.mutate({ sessionId: preview.id })}>
              {t("live.rsvp.withdrawCta")}
            </button>
          </div>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "1.25rem" }}>
            {t("live.rsvp.confirmed.reminder", { code })}
          </p>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          disabled={rsvp.isPending}
          onClick={() => rsvp.mutate({ sessionId: preview.id })}
        >
          {rsvp.isPending ? t("live.rsvp.cta.reserving") : t("live.rsvp.cta.reserve")}
        </button>
      )}
    </div>
  );
}

export default function RsvpPage() {
  const { t } = useLocale();
  return (
    <Suspense fallback={<div className="page-narrow"><p style={{ color: "var(--text-muted)" }}>{t("common.loading")}</p></div>}>
      <RsvpInner />
    </Suspense>
  );
}
