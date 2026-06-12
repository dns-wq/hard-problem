"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LiveSession } from "@/types/database";

// Realtime here is a nudge, not state transport: every event handler should
// refetch via tRPC (the DB is the only source of truth), and screens keep a
// 5s polling fallback while lobby/voting so a dropped websocket degrades to
// polling rather than freezing.
//
// Channel topics are unique PER MOUNT: the browser Supabase client is a
// singleton and realtime-js reuses a channel instance for an already-known
// topic while removeChannel tears down asynchronously — with a fixed topic,
// StrictMode's dev double-mount gets the still-leaving channel back and the
// second subscribe silently no-ops. Topic names are client-local, so
// uniqueness costs nothing.
//
// JWT handling (initial token + refresh) is automatic in supabase-js ≥2.x —
// do not call realtime.setAuth() manually.

// Phone + host screens: session state transitions (lobby→voting→revealed→ended).
// Only subscribe after join succeeds (`enabled`) — events delivered before the
// participant row commits are dropped by per-subscriber RLS, not queued.
export function usePlaySessionChannel(
  sessionId: string | null | undefined,
  enabled: boolean,
  onSessionUpdate: (next: LiveSession) => void,
) {
  const handlerRef = useRef(onSessionUpdate);
  handlerRef.current = onSessionUpdate;
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!sessionId || !enabled) return;
    const supabase = createClient();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(`live-session-${sessionId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_sessions", filter: `id=eq.${sessionId}` },
        // Decide from the payload, never from component state captured in a
        // closure — the channel outlives renders.
        (payload) => handlerRef.current(payload.new as LiveSession),
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // realtime-js can report these repeatedly for one channel — clear
          // before re-arming so orphaned timers don't multiply resubscribes
          if (retryTimer) clearTimeout(retryTimer);
          // Tear down and resubscribe on a fresh topic (effect re-runs)
          retryTimer = setTimeout(() => setRetryKey((k) => k + 1), 3000);
        } else if (status === "CLOSED" && process.env.NODE_ENV !== "production") {
          console.debug("[live] session channel closed", sessionId);
        }
      });

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      supabase.removeChannel(channel);
    };
  }, [sessionId, enabled, retryKey]);
}

// Host screen only: vote and join activity, throttled to ≤1 refetch/sec.
// Only the host holds these subscriptions — vote volume never fans out to
// participant phones.
export function useHostSessionChannel(
  sessionId: string | null | undefined,
  enabled: boolean,
  onActivity: () => void,
) {
  const handlerRef = useRef(onActivity);
  handlerRef.current = onActivity;
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!sessionId || !enabled) return;
    const supabase = createClient();
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    // Batch bursts of events into at most one refetch per second
    const bump = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        handlerRef.current();
      }, 1000);
    };

    const channel = supabase
      .channel(`live-host-${sessionId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_responses", filter: `session_id=eq.${sessionId}` },
        bump,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_responses", filter: `session_id=eq.${sessionId}` },
        bump, // vote changes
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_participants", filter: `session_id=eq.${sessionId}` },
        bump,
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => setRetryKey((k) => k + 1), 3000);
        } else if (status === "CLOSED" && process.env.NODE_ENV !== "production") {
          console.debug("[live] host channel closed", sessionId);
        }
      });

    return () => {
      // Clear the throttle in the same cleanup that removes the channel —
      // a trailing refetch must not fire after End → navigation.
      if (throttleTimer) clearTimeout(throttleTimer);
      if (retryTimer) clearTimeout(retryTimer);
      supabase.removeChannel(channel);
    };
  }, [sessionId, enabled, retryKey]);
}

// Host screen only: spotlight draw rows (new draws, pass/share/clear outcomes,
// note_shared flips). The DRAW itself also flips the live_sessions pointer, so
// the play channel already nudges every screen; this host-only channel exists so
// outcome/note changes that DON'T move the pointer (a pass, a "show my note")
// reach the projector instantly instead of waiting on the 5s poll. Phones never
// subscribe here — draw volume is low, but the rule holds: only the host watches.
export function useSpotlightDrawsChannel(
  sessionId: string | null | undefined,
  enabled: boolean,
  onActivity: () => void,
) {
  const handlerRef = useRef(onActivity);
  handlerRef.current = onActivity;
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!sessionId || !enabled) return;
    const supabase = createClient();
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const bump = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        handlerRef.current();
      }, 1000);
    };

    const channel = supabase
      .channel(`live-spotlight-${sessionId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_spotlight_draws", filter: `session_id=eq.${sessionId}` },
        bump,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_spotlight_draws", filter: `session_id=eq.${sessionId}` },
        bump, // pass / share / note_shared
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => setRetryKey((k) => k + 1), 3000);
        } else if (status === "CLOSED" && process.env.NODE_ENV !== "production") {
          console.debug("[live] spotlight channel closed", sessionId);
        }
      });

    return () => {
      if (throttleTimer) clearTimeout(throttleTimer);
      if (retryTimer) clearTimeout(retryTimer);
      supabase.removeChannel(channel);
    };
  }, [sessionId, enabled, retryKey]);
}
