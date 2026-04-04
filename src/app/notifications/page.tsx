"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

const TYPE_LABEL: Record<string, string> = {
  build_on: "built on your contribution",
  reply: "reacted to your contribution",
  moderation: "your contribution was removed by a moderator",
};

export default function NotificationsPage() {
  const { data: notifications, isLoading, refetch } = trpc.notifications.list.useQuery({ limit: 50 });
  const markAll = trpc.notifications.markAllRead.useMutation({ onSuccess: () => refetch() });
  const markOne = trpc.notifications.markRead.useMutation({ onSuccess: () => refetch() });

  const unread = (notifications ?? []).filter((n) => !n.is_read).length;

  return (
    <div className="page-narrow">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700 }}>Notifications</h1>
        {unread > 0 && (
          <button
            type="button"
            className="btn"
            style={{ fontSize: "0.8rem" }}
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
          >
            Mark all read
          </button>
        )}
      </div>

      {isLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : !notifications?.length ? (
        <div style={{ textAlign: "center", padding: "3rem 0" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No notifications yet.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {notifications.map((n) => {
            const topic = n.topic as { id: string; title: string; slug: string } | null;
            const actor = n.actor as { id: string; display_name: string } | null;

            return (
              <div
                key={n.id}
                style={{
                  padding: "0.875rem 0",
                  borderBottom: "1px solid var(--border-light)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "1rem",
                  opacity: n.is_read ? 0.65 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "0.875rem", color: "var(--text-primary)", margin: "0 0 0.2rem" }}>
                    {n.type === "moderation" ? (
                      <span style={{ color: "#c44" }}>{TYPE_LABEL.moderation}</span>
                    ) : (
                      <>
                        <strong>{actor?.display_name ?? "Someone"}</strong>{" "}
                        {TYPE_LABEL[n.type] ?? "interacted with your contribution"}
                      </>
                    )}
                  </p>
                  {topic && (
                    <Link
                      href={`/topics/${topic.slug}/discuss`}
                      style={{ fontSize: "0.78rem", color: "var(--accent)", textDecoration: "none" }}
                      onClick={() => !n.is_read && markOne.mutate({ id: n.id })}
                    >
                      {topic.title} →
                    </Link>
                  )}
                  <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: "0.2rem 0 0" }}>
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
                {!n.is_read && (
                  <button
                    type="button"
                    onClick={() => markOne.mutate({ id: n.id })}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--accent)",
                      border: "none",
                      cursor: "pointer",
                      flexShrink: 0,
                      marginTop: "0.3rem",
                      padding: 0,
                    }}
                    title="Mark as read"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
