"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { createClient } from "@/lib/supabase/client";
import { useNotificationStore } from "@/stores/ui";
import type { Notification } from "@/types/database";
import Link from "next/link";

export function NotificationBell() {
  const { unreadCount, setUnreadCount, incrementUnread, dropdownOpen, setDropdownOpen } =
    useNotificationStore();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: count } = trpc.notifications.unreadCount.useQuery(undefined, {
    staleTime: 30_000,
  });

  useEffect(() => {
    if (count !== undefined) setUnreadCount(count);
  }, [count]);

  const { data: notifications, refetch } = trpc.notifications.list.useQuery(undefined, {
    enabled: dropdownOpen,
    staleTime: 10_000,
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      setUnreadCount(0);
    },
  });

  // Realtime subscription for new notifications
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("user-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          // Note: client-side filter only — verify user_id on receipt
        },
        (payload) => {
          // Only increment if the notification is for the current user
          supabase.auth.getUser().then(({ data }) => {
            if (data.user && payload.new.user_id === data.user.id) {
              incrementUnread();
            }
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  function handleOpen() {
    setDropdownOpen(!dropdownOpen);
    if (!dropdownOpen && (count ?? 0) > 0) {
      markAllRead.mutate();
      refetch();
    }
  }

  const displayCount = Math.min(unreadCount, 99);

  return (
    <div className="notification-bell" ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={handleOpen}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "inherit" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {displayCount > 0 && (
          <span className="notification-badge">{displayCount}</span>
        )}
      </button>

      {dropdownOpen && (
        <div className="notification-dropdown">
          <div style={{ padding: "0.6rem 1rem", borderBottom: "1px solid var(--border-light)", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Notifications
          </div>
          {!notifications || notifications.length === 0 ? (
            <div style={{ padding: "1.5rem 1rem", fontSize: "0.85rem", color: "var(--text-muted)", textAlign: "center" }}>
              No notifications yet
            </div>
          ) : (
            notifications.slice(0, 5).map((n) => (
              <NotificationItem key={n.id} notification={n as unknown as Notification} />
            ))
          )}
          <div style={{ padding: "0.5rem 1rem", borderTop: "1px solid var(--border-light)" }}>
            <Link href="/notifications" style={{ fontSize: "0.75rem", color: "var(--accent)", textDecoration: "none" }} onClick={() => setDropdownOpen(false)}>
              See all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({ notification: n }: { notification: Notification }) {
  const topicSlug = (n as unknown as { topic?: { slug: string } }).topic?.slug;
  const actorName = (n as unknown as { actor?: { display_name: string } }).actor?.display_name ?? "Someone";
  const topicTitle = (n as unknown as { topic?: { title: string } }).topic?.title ?? "a topic";

  const text =
    n.type === "build_on"
      ? `${actorName} built on your contribution in "${topicTitle}"`
      : n.type === "reply"
      ? `${actorName} reacted to your contribution in "${topicTitle}"`
      : `Your contribution in "${topicTitle}" was removed by a moderator`;

  const href = topicSlug ? `/topics/${topicSlug}/discuss` : "/notifications";

  return (
    <Link
      href={href}
      className={`notification-item ${!n.is_read ? "unread" : ""}`}
    >
      {text}
      <span style={{ display: "block", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>
        {new Date(n.created_at).toLocaleDateString()}
      </span>
    </Link>
  );
}
