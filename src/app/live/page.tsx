"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc/client";
import { LIVE_CODE_REGEX } from "@/lib/liveCode";

const STATUS_LABEL: Record<string, string> = {
  lobby: "In lobby",
  voting: "Voting open",
  revealed: "Results revealed",
  ended: "Ended",
};

export default function LivePage() {
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  // Host recovery: a lost projector tab is re-found here
  const { data: mySessions } = trpc.live.mySessions.useQuery(undefined, { enabled: !!user });
  const { data: myRsvps } = trpc.live.myRsvps.useQuery(undefined, { enabled: !!user });

  // Opportunistic reminder delivery: fire when a host loads /live near a
  // scheduled session's start (no cron). Idempotent via reminders_sent_at.
  const dispatchReminders = trpc.live.dispatchDueReminders.useMutation();
  useEffect(() => {
    if (user) dispatchReminders.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    // Format check only — the authoritative lookup happens on the play page
    // after its auth gate (byCode is a protected, rate-limited procedure)
    if (!LIVE_CODE_REGEX.test(normalized)) {
      setFormError("Codes are 6 letters/digits — check the host screen.");
      return;
    }
    router.push(`/live/play/${normalized}`);
  }

  return (
    <div className="auth-container">
      <h1 className="auth-title">Join a live session</h1>
      <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: "1.25rem" }}>
        Enter the code on the host&apos;s screen, or scan their QR code with your camera.
      </p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <input
          className="auth-input live-code-input"
          type="text"
          placeholder="ABC123"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setFormError("");
          }}
          maxLength={6}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
        />
        {formError && <p className="auth-error">{formError}</p>}
        <button className="auth-submit" type="submit">
          Join session
        </button>
      </form>

      {!!myRsvps?.length && (
        <section style={{ marginTop: "2.5rem" }}>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
            Your upcoming RSVPs
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {myRsvps.map((r: { session_id: string; code: string; status: string; starts_at: string | null; topic_title: string }) => (
              <Link
                key={r.session_id}
                href={`/live/rsvp?code=${r.code}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.6rem 0.85rem",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-light)",
                  borderRadius: 8,
                  textDecoration: "none",
                }}
              >
                <span style={{ fontSize: "0.85rem", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.topic_title}
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {r.status !== "lobby"
                    ? "Live now"
                    : r.starts_at
                      ? new Date(r.starts_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                      : "Scheduled"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!!mySessions?.length && (
        <section style={{ marginTop: "2.5rem" }}>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
            Sessions you host
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {mySessions.map((s) => (
              <Link
                key={s.id}
                href={`/live/host/${s.code}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.6rem 0.85rem",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-light)",
                  borderRadius: 8,
                  textDecoration: "none",
                }}
              >
                <span style={{ fontSize: "0.85rem", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {(s.topic as { title?: string } | null)?.title ?? "Untitled topic"}
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {s.code} · {STATUS_LABEL[s.status] ?? s.status}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2rem" }}>
        Want to host one? Open any topic and choose “Host live session”.
      </p>
    </div>
  );
}
