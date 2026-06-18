import { randomInt } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/server";
import { LIVE_CODE_ALPHABET, LIVE_CODE_REGEX } from "@/lib/liveCode";
import { overlayOne } from "@/lib/i18n/contentOverlay";
import { logLiveEvent } from "@/lib/structuredLog";
import type {
  CurrentSpotlight,
  DrawResult,
  SpotlightHistoryRow,
  CurrentQuizRound,
  QuizAggregateRow,
  QuizLeaderboardRow,
  CurrentLiveBlock,
  LiveBlockAggregate,
  LiveBlockRun,
  LiveBlockLeaderboardRow,
  LiveSessionBlock,
} from "@/types/database";

// Live Sessions (Sprint 1) — see docs/sprint-1-live-sessions.md.
// The 6-char session code is a held capability: pre-join interactions go
// through SECURITY DEFINER RPCs (rate-limited lookup, server-side join);
// everything after join is plain member-scoped RLS reads/writes.

const TRANSITIONS: Record<string, string[]> = {
  lobby: ["voting", "ended"],
  voting: ["revealed", "ended"],
  revealed: ["voting", "ended"], // reopen voting is allowed; ended is terminal
};

// Spotlight draw modes (Sprint 2) — mirror the live_spotlight_draws CHECK
const SPOTLIGHT_MODES = ["uniform", "no_repeat", "minority_weighted", "minority_steelman"] as const;
const BLOCK_KINDS = ["text", "video", "choice", "open_text", "word_cloud", "scale", "ranking", "quiz"] as const;
const SHARE_SCOPES = ["private", "anonymous", "named"] as const;
const blockDraftSchema = z.object({
  kind: z.enum(BLOCK_KINDS),
  title: z.string().max(120).default(""),
  prompt: z.string().max(500).default(""),
  config: z.record(z.string(), z.unknown()).default({}),
  content: z.record(z.string(), z.unknown()).default({}),
  sourceType: z.enum(["custom", "topic_prompt", "topic_anchor", "paper_excerpt", "topic_video", "quiz_bank"]).nullable().optional(),
  sourceId: z.string().max(200).nullable().optional(),
  comparisonGroupId: z.string().uuid().nullable().optional(),
  skipped: z.boolean().optional(),
}).superRefine((block, ctx) => {
  const config = block.config;
  const options = Array.isArray(config.options) ? config.options as Array<{ id?: unknown; label?: unknown }> : [];
  const issue = (message: string, path: (string | number)[] = ["config"]) => ctx.addIssue({ code: "custom", message, path });
  if (block.kind === "text" && (typeof block.content.body !== "string" || block.content.body.trim().length === 0)) issue("Text blocks need content.", ["content", "body"]);
  if (block.kind === "video" && (typeof block.content.youtube_id !== "string" || !/^[A-Za-z0-9_-]{6,32}$/.test(block.content.youtube_id))) issue("Select a valid topic video.", ["content", "youtube_id"]);
  if (["choice", "ranking"].includes(block.kind)) {
    if (options.length < 2 || options.length > 8) issue("Use between 2 and 8 options.");
    if (options.some((o) => typeof o.id !== "string" || typeof o.label !== "string" || !o.label.trim())) issue("Every option needs an id and label.");
    if (new Set(options.map((o) => o.id)).size !== options.length) issue("Option ids must be unique.");
  }
  if (block.kind === "choice") {
    const max = Number(config.max_selections ?? 1);
    if (!Number.isInteger(max) || max < 1 || max > options.length) issue("Maximum selections is outside the option range.");
  }
  if (block.kind === "ranking") {
    const count = Number(config.required_count ?? options.length);
    if (!Number.isInteger(count) || count < 1 || count > options.length) issue("Required rank count is outside the option range.");
  }
  if (block.kind === "scale") {
    const min = Number(config.min ?? 1); const max = Number(config.max ?? 5);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max || max - min + 1 > 10) issue("Scale must contain 2 to 10 integer points.");
  }
  if (block.kind === "open_text" && (Number(config.max_length) < 1 || Number(config.max_length) > 500)) issue("Open text length must be between 1 and 500.");
  if (block.kind === "word_cloud" && (Number(config.max_entries) < 1 || Number(config.max_entries) > 3 || Number(config.max_entry_length) < 1 || Number(config.max_entry_length) > 40)) issue("Word cloud limits are invalid.");
  if (block.kind === "quiz") {
    const questionType = config.question_type;
    const correct = config.correct_answer;
    if (!block.prompt.trim()) issue("Quiz blocks need a question.", ["prompt"]);
    if (questionType === "true_false" && !["true", "false"].includes(String(correct).toLowerCase())) issue("Choose the correct true/false answer.");
    if (questionType === "mcq" && (options.length < 2 || !options.some((o) => o.id === correct))) issue("Choose a correct answer from the quiz options.");
    const seconds = Number(config.answer_window_sec ?? 20);
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 600) issue("Quiz timer must be between 5 and 600 seconds.");
  }
});

function generateCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += LIVE_CODE_ALPHABET[randomInt(LIVE_CODE_ALPHABET.length)];
  }
  return code;
}

type RundownCreationMode = "off" | "internal" | "all";
function rundownCreationMode(): RundownCreationMode {
  const configured = process.env.LIVE_RUNDOWN_V2_CREATION;
  if (configured === "off" || configured === "internal" || configured === "all") return configured;
  // Temporary compatibility for environments that still carry the draft flag.
  return process.env.LIVE_RUNDOWN_V2_ENABLED === "true" ? "internal" : "off";
}

// RAISE EXCEPTION messages from the 005 RPCs arrive as PostgrestError.message
function rpcErrorIncludes(error: { message?: string } | null, token: string) {
  return error?.message?.includes(token) ?? false;
}

// Service-role client for the few writes RLS deliberately forbids the user
// client (reminder notifications — the table has no INSERT policy; stamping the
// pinned reminders_sent_at column). Mirrors the stripe/webhook admin pattern.
function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export const liveRouter = createTRPCRouter({
  // Create a session for a published topic with 2-6 snapshotted vote options (protected)
  create: protectedProcedure
    .input(
      z.object({
        topicId: z.string().uuid(),
        question: z.string().max(500).optional(),
        options: z
          .array(
            z.object({
              label: z.string().min(1).max(100),
              sourceStanceTag: z.string().max(100).nullable().optional(),
            }),
          )
          .min(0) // raffle sessions have no vote options; the body enforces ≥2 otherwise
          .max(6),
        raffleMode: z.boolean().optional(),
        startsAt: z.string().datetime().optional(),
        publish: z.boolean().optional(),
        blocks: z.array(blockDraftSchema).max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: topic, error: topicError } = await ctx.supabase
        .from("topics")
        .select("id, status, discussion_prompt")
        .eq("id", input.topicId)
        .single();
      if (topicError && topicError.code !== "PGRST116") throw topicError;
      if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "Topic not found." });
      if (topic.status !== "published") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Sessions can only be hosted on published topics." });
      }

      // Raffle sessions (the tender skin) carry no vote options; everything else needs ≥2
      const isRaffle = input.raffleMode ?? false;
      const creationMode = rundownCreationMode();
      const { data: creator } = await ctx.supabase.from("users").select("role").eq("id", ctx.user.id).single();
      const eligibleForRundown = creationMode === "all" || (creationMode === "internal" && ["editor", "admin"].includes(creator?.role ?? "user"));
      const useRundown = eligibleForRundown && !isRaffle;
      if (!useRundown && !isRaffle && input.options.length < 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A stance vote needs at least 2 options." });
      }

      const labels = input.options.map((o) => o.label.trim());
      if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Vote options must be distinct." });
      }

      const seedBlocks: z.infer<typeof blockDraftSchema>[] = input.blocks?.length
        ? input.blocks
        : [{
            kind: "choice" as const,
            title: "",
            prompt: input.question?.trim() || topic.discussion_prompt || "",
            config: {
              options: input.options.map((o, i) => ({ id: `option-${i + 1}`, label: o.label.trim() })),
              max_selections: 1,
              allow_note: true,
              audience_results: "on_reveal",
            },
            content: {},
            sourceType: "topic_prompt" as const,
            sourceId: input.topicId,
          }];

      // Version 2 creates the session and rundown in one transaction. Legacy
      // and raffle creation retain the existing direct-insert path.
      let session: { id: string; code: string } | null = null;
      for (let attempt = 0; attempt < 3 && !session; attempt++) {
        const code = generateCode();
        const result = useRundown
          ? await ctx.supabase.rpc("create_live_rundown_session", {
              p_code: code,
              p_topic_id: input.topicId,
              p_question: input.question?.trim() || topic.discussion_prompt || "",
              p_blocks: seedBlocks.map((b) => ({
                kind: b.kind, title: b.title ?? "", prompt: b.prompt ?? "", config: b.config ?? {}, content: b.content ?? {},
                source_type: b.sourceType ?? null, source_id: b.sourceId ?? null,
                comparison_group_id: b.comparisonGroupId ?? null, skipped: b.skipped ?? false,
              })),
              p_starts_at: input.startsAt ?? null,
              p_published: input.publish ?? true,
            })
          : await ctx.supabase.from("live_sessions").insert({
              code,
              topic_id: input.topicId,
              host_id: ctx.user.id,
              question: input.question?.trim() || topic.discussion_prompt || "",
              raffle_mode: isRaffle,
            }).select("id, code");
        const { data, error } = result;
        if (error && error.code !== "23505") throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (row) session = useRundown
          ? { id: (row as { session_id: string }).session_id, code: (row as { session_code: string }).session_code }
          : row as { id: string; code: string };
      }
      if (!session) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not allocate a session code." });
      }

      if (!useRundown && input.options.length > 0) {
        const { error: optionsError } = await ctx.supabase.from("live_session_options").insert(
          input.options.map((o, i) => ({
            session_id: session.id,
            label: o.label.trim(),
            source_stance_tag: o.sourceStanceTag ?? null,
            display_order: i,
          })),
        );
        if (optionsError) {
          // No DELETE policy on sessions — end the orphan so its code can't be joined
          await ctx.supabase
            .from("live_sessions")
            .update({ status: "ended", ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", session.id)
            .eq("host_id", ctx.user.id);
          throw optionsError;
        }
      }

      // Optional: schedule + publish in the same step (definer RPC owns the pinned columns)
      if (input.startsAt && !useRundown) {
        await ctx.supabase.rpc("schedule_live_session", {
          p_session_id: session.id,
          p_starts_at: input.startsAt,
          p_publish: input.publish ?? true,
        });
      }

      if (useRundown) logLiveEvent("rundown.created", { session_id: session.id, block_count: seedBlocks.length, scheduled: !!input.startsAt });

      return session;
    }),

  rundownEnabled: protectedProcedure.query(async ({ ctx }) => {
    const mode = rundownCreationMode();
    if (mode === "all") return true;
    if (mode === "off") return false;
    const { data } = await ctx.supabase.from("users").select("role").eq("id", ctx.user.id).single();
    return ["editor", "admin"].includes(data?.role ?? "user");
  }),

  blockSources: protectedProcedure
    .input(z.object({ topicId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [{ data: topic, error: topicError }, { data: papers, error: paperError }, { data: quizzes, error: quizError }] = await Promise.all([
        ctx.supabase.from("topics").select("id, framing_note, discussion_prompt, real_world_anchor, videos").eq("id", input.topicId).single(),
        ctx.supabase.from("papers").select("id, title, abstract, source_url, role").eq("topic_id", input.topicId).order("display_order"),
        ctx.supabase.from("quiz_questions").select("id, question_text, question_type, options, correct_answer, explanation").eq("topic_id", input.topicId).order("display_order"),
      ]);
      if (topicError) throw topicError;
      if (paperError) throw paperError;
      if (quizError) throw quizError;
      return { topic, papers: papers ?? [], quizzes: quizzes ?? [] };
    }),

  rundown: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("get_live_rundown", { p_session_id: input.sessionId });
      if (error) throw error;
      const value = (data ?? { blocks: [], runs: [] }) as { blocks: LiveSessionBlock[]; runs: LiveBlockRun[] };
      return value;
    }),

  replaceRundown: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), blocks: z.array(blockDraftSchema).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("replace_live_rundown", {
        p_session_id: input.sessionId,
        p_blocks: input.blocks.map((b) => ({
          kind: b.kind, title: b.title, prompt: b.prompt, config: b.config, content: b.content,
          source_type: b.sourceType ?? null, source_id: b.sourceId ?? null,
          comparison_group_id: b.comparisonGroupId ?? null, skipped: b.skipped ?? false,
        })),
      });
      if (error) throw error;
      return (data ?? []) as LiveSessionBlock[];
    }),

  activateBlock: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), blockId: z.string().uuid(), rerun: z.boolean().optional(), requestId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("activate_live_block_v2", {
        p_session_id: input.sessionId, p_block_id: input.blockId, p_rerun: input.rerun ?? false,
        p_request_id: input.requestId ?? crypto.randomUUID(),
      });
      if (error) throw error;
      logLiveEvent("rundown.block_activated", { session_id: input.sessionId, block_id: input.blockId, rerun: input.rerun ?? false });
      return { runId: data as string };
    }),

  skipBlock: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), blockId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc("skip_live_block", { p_session_id: input.sessionId, p_block_id: input.blockId });
      if (error) throw error;
    }),

  endRundown: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc("end_live_rundown_session", { p_session_id: input.sessionId });
      if (error) throw error;
      logLiveEvent("rundown.session_ended", { session_id: input.sessionId });
    }),

  revisitBlock: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc("set_current_live_block_run", { p_session_id: input.sessionId, p_run_id: input.runId });
      if (error) throw error;
    }),

  closeBlock: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc("close_live_block", { p_session_id: input.sessionId, p_run_id: input.runId });
      if (error) throw error;
      logLiveEvent("rundown.block_closed", { session_id: input.sessionId, run_id: input.runId });
    }),

  revealBlock: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc("reveal_live_block", { p_session_id: input.sessionId, p_run_id: input.runId });
      if (error) throw error;
      logLiveEvent("rundown.block_revealed", { session_id: input.sessionId, run_id: input.runId });
    }),

  currentBlock: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("get_current_live_block", { p_session_id: input.sessionId });
      if (error) throw error;
      return (data ?? null) as CurrentLiveBlock | null;
    }),

  ownBlockResponse: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("get_my_live_block_response", { p_run_id: input.runId });
      if (error) throw error;
      return (data ?? null) as CurrentLiveBlock["my_response"];
    }),

  blockAggregate: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("get_live_block_aggregate", { p_run_id: input.runId });
      if (error) throw error;
      return data as LiveBlockAggregate;
    }),

  blockLeaderboard: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("get_live_quiz_leaderboard_v2", { p_session_id: input.sessionId });
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({ ...row, total_score: Number(row.total_score), correct_count: Number(row.correct_count) })) as LiveBlockLeaderboardRow[];
    }),

  shareCandidates: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("get_live_share_candidates", { p_run_id: input.runId });
      if (error) throw error;
      return data ?? [];
    }),

  submitBlockResponse: protectedProcedure
    .input(z.object({
      runId: z.string().uuid(), answer: z.record(z.string(), z.unknown()),
      text: z.string().max(500).nullable().optional(), shareScope: z.enum(SHARE_SCOPES).default("private"),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("submit_live_block_response", {
        p_run_id: input.runId, p_answer: input.answer, p_text: input.text ?? null, p_share_scope: input.shareScope,
      });
      if (error) throw error;
      logLiveEvent("rundown.response_submitted", { run_id: input.runId, has_text: !!input.text, share_scope: input.shareScope });
      return { responseId: data as string };
    }),

  setBlockResponseShareScope: protectedProcedure
    .input(z.object({ responseId: z.string().uuid(), shareScope: z.enum(SHARE_SCOPES) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc("set_live_response_share_scope", {
        p_response_id: input.responseId, p_share_scope: input.shareScope,
      });
      if (error) throw error;
      logLiveEvent("rundown.consent_changed", { response_id: input.responseId, share_scope: input.shareScope });
    }),

  publishBlockResponse: protectedProcedure
    .input(z.object({ responseId: z.string().uuid(), displayOrder: z.number().int().min(0).default(0) }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("publish_live_response", {
        p_response_id: input.responseId, p_display_order: input.displayOrder,
      });
      if (error) throw error;
      logLiveEvent("rundown.publication_changed", { response_id: input.responseId, active: true });
      return { publicationId: data as string };
    }),

  removeBlockPublication: protectedProcedure
    .input(z.object({ publicationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc("remove_live_response_publication", { p_publication_id: input.publicationId });
      if (error) throw error;
    }),

  // Resolve a code to a session preview — pre-join only; rate-limited for non-members (protected)
  byCode: protectedProcedure
    .input(z.object({ code: z.string().min(1).max(12) }))
    .query(async ({ ctx, input }) => {
      const code = input.code.trim().toUpperCase();
      if (!LIVE_CODE_REGEX.test(code)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No session with that code." });
      }

      const { data, error } = await ctx.supabase.rpc("get_live_session_by_code", { p_code: code });
      if (error) {
        if (rpcErrorIncludes(error, "rate_limited")) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many lookups — wait a minute and try again." });
        }
        throw error;
      }

      const preview = data?.[0];
      if (!preview) throw new TRPCError({ code: "NOT_FOUND", message: "No session with that code." });
      return preview;
    }),

  // Full session state for members — the steady-state query both screens poll (protected)
  bySessionId: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: session, error: sessionError } = await ctx.supabase
        .from("live_sessions")
        .select("*, topic:topics(id, title, slug)")
        .eq("id", input.sessionId)
        .single();
      if (sessionError && sessionError.code !== "PGRST116") throw sessionError;

      // RLS hides the row entirely from non-members
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });

      const isHost = session.host_id === ctx.user.id;

      const [
        { data: options, error: optionsError },
        { data: myResponse, error: myResponseError },
        { data: myParticipant, error: myParticipantError },
      ] = await Promise.all([
        ctx.supabase
          .from("live_session_options")
          .select("*")
          .eq("session_id", input.sessionId)
          .order("display_order", { ascending: true }),
        ctx.supabase
          .from("live_responses")
          .select("*")
          .eq("session_id", input.sessionId)
          .eq("user_id", ctx.user.id)
          .eq("round_number", 1)
          .maybeSingle(),
        // The caller's own consent bit, for the "open to being called on" toggle
        ctx.supabase
          .from("live_participants")
          .select("callable")
          .eq("session_id", input.sessionId)
          .eq("user_id", ctx.user.id)
          .maybeSingle(),
      ]);
      if (optionsError) throw optionsError;
      // A swallowed error here would re-show a blank vote form to a phone
      // that has already voted — fail loudly instead
      if (myResponseError) throw myResponseError;
      if (myParticipantError) throw myParticipantError;

      // Participant count is host-only (participant RLS sees just its own row)
      let participantCount: number | null = null;
      if (isHost) {
        const { count, error: countError } = await ctx.supabase
          .from("live_participants")
          .select("*", { count: "exact", head: true })
          .eq("session_id", input.sessionId);
        if (countError) throw countError;
        participantCount = count ?? 0;
      }

      return {
        session,
        options: options ?? [],
        myResponse: myResponse ?? null,
        isHost,
        participantCount,
        myCallable: myParticipant?.callable ?? null,
      };
    }),

  // Join a session — server-side display_name snapshot; no-op for existing participants (protected)
  join: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), callable: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc("join_live_session", {
        p_session_id: input.sessionId,
        p_callable: input.callable ?? true,
      });
      if (error) {
        if (rpcErrorIncludes(error, "session_closed")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This session has ended." });
        }
        if (rpcErrorIncludes(error, "profile_missing")) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Your account profile is incomplete — try signing out and back in.",
          });
        }
        if (rpcErrorIncludes(error, "not_found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
        }
        throw error;
      }
    }),

  // Host-only state transition: lobby→voting→revealed(⇄voting)→ended (protected)
  setStatus: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        status: z.enum(["voting", "revealed", "ended"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: session, error: sessionError } = await ctx.supabase
        .from("live_sessions")
        .select("id, host_id, status")
        .eq("id", input.sessionId)
        .single();
      if (sessionError && sessionError.code !== "PGRST116") throw sessionError;

      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
      if (session.host_id !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the host can change the session state." });
      }
      // Same-status is a no-op success (mirrors the DB trigger) — a host with
      // two tabs slightly out of sync should resync, not see an error
      if (session.status === input.status) return;
      if (!TRANSITIONS[session.status]?.includes(input.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot move a session from "${session.status}" to "${input.status}".`,
        });
      }

      const { error } = await ctx.supabase
        .from("live_sessions")
        .update({
          status: input.status,
          updated_at: new Date().toISOString(),
          ...(input.status === "ended" ? { ended_at: new Date().toISOString() } : {}),
        })
        .eq("id", input.sessionId)
        .eq("host_id", ctx.user.id); // RLS-equivalent guard
      if (error) throw error;
    }),

  // Cast or change a vote while voting is open — RLS independently enforces
  // membership, the voting window, option-in-session, and round 1 (protected)
  vote: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        optionId: z.string().uuid(),
        note: z.string().max(140).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("live_responses").upsert(
        {
          session_id: input.sessionId,
          user_id: ctx.user.id,
          option_id: input.optionId,
          note: input.note?.trim() || null,
          round_number: 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "session_id,user_id,round_number" },
      );
      if (error) {
        if (error.code === "42501") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Voting is closed (or you haven't joined this session)." });
        }
        throw error;
      }
    }),

  // Aggregate results — host anytime; the room only once revealed (protected)
  tally: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("get_live_tally", { p_session_id: input.sessionId });
      if (error) {
        if (rpcErrorIncludes(error, "forbidden")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Results are revealed by the host." });
        }
        if (rpcErrorIncludes(error, "not_found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
        }
        throw error;
      }

      const rows = data ?? [];
      return {
        options: rows.map((r: { option_id: string; label: string; display_order: number; vote_count: number }) => ({
          optionId: r.option_id,
          label: r.label,
          displayOrder: r.display_order,
          count: Number(r.vote_count),
        })),
        total: rows.reduce((sum: number, r: { vote_count: number }) => sum + Number(r.vote_count), 0),
        participantCount: rows.length > 0 ? Number(rows[0].participant_count) : 0,
      };
    }),

  // ===== Spotlight Draw (Sprint 2) =====

  // Host draws a participant — server-authoritative randomness; the host passes only a mode (protected)
  draw: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        mode: z.enum(SPOTLIGHT_MODES),
        excludeUserId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: session } = await ctx.supabase.from("live_sessions").select("format_version").eq("id", input.sessionId).single();
      const rpcName = session?.format_version === 2 ? "draw_block_spotlight" : "draw_spotlight";
      const { data, error } = await ctx.supabase.rpc(rpcName, {
        p_session_id: input.sessionId,
        p_mode: input.mode,
        p_exclude_user_id: input.excludeUserId ?? null,
      });
      if (error) {
        if (rpcErrorIncludes(error, "forbidden")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the host can draw." });
        }
        if (rpcErrorIncludes(error, "not_found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
        }
        if (rpcErrorIncludes(error, "session_closed")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This session isn't live — open voting first." });
        }
        // Order matters: "no_minority_voters" contains "no_minority" as a substring
        if (rpcErrorIncludes(error, "no_minority_voters")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No one voted for the minority view yet — switch modes." });
        }
        if (rpcErrorIncludes(error, "no_minority")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "There's no minority option yet — try uniform or no-repeat." });
        }
        if (rpcErrorIncludes(error, "no_eligible_participants")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No one is eligible to be drawn yet." });
        }
        if (rpcErrorIncludes(error, "bad_mode")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown draw mode." });
        }
        throw error;
      }
      return (data?.[0] ?? null) as DrawResult | null;
    }),

  // The active spotlight (or null) — every screen refetches this on the nudge (protected)
  currentSpotlight: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("get_current_spotlight", { p_session_id: input.sessionId });
      if (error) {
        if (rpcErrorIncludes(error, "forbidden")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Join the session to see the spotlight." });
        }
        if (rpcErrorIncludes(error, "not_found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
        }
        throw error;
      }
      return (data?.[0] ?? null) as CurrentSpotlight | null;
    }),

  // The drawn participant declines — their own act, RLS-gated to the current spotlight (protected)
  passDraw: protectedProcedure
    .input(z.object({ drawId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("live_spotlight_draws")
        .update({ outcome: "passed", resolved_at: new Date().toISOString() })
        .eq("id", input.drawId)
        .select("id");
      if (error) {
        if (error.code === "42501") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You can't pass this draw." });
        }
        throw error;
      }
      // 0 rows = the USING clause excluded it (no longer the current spotlight)
      if (!data?.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This spotlight is no longer active." });
      }
    }),

  // The drawn participant shares aloud, optionally projecting their note — their own act (protected)
  shareDraw: protectedProcedure
    .input(z.object({ drawId: z.string().uuid(), shareNote: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.shareNote) {
        const { data: draw } = await ctx.supabase
          .from("live_spotlight_draws")
          .select("block_run_id")
          .eq("id", input.drawId)
          .maybeSingle();
        if (draw?.block_run_id) {
          const { data: response } = await ctx.supabase
            .from("live_block_responses")
            .select("id")
            .eq("run_id", draw.block_run_id)
            .eq("user_id", ctx.user.id)
            .maybeSingle();
          if (response) {
            const { error: scopeError } = await ctx.supabase.rpc("set_live_response_share_scope", {
              p_response_id: response.id,
              p_share_scope: "named",
            });
            if (scopeError) throw scopeError;
          }
        }
      }
      const { data, error } = await ctx.supabase
        .from("live_spotlight_draws")
        .update({ outcome: "shared", note_shared: input.shareNote ?? false, resolved_at: new Date().toISOString() })
        .eq("id", input.drawId)
        .select("id");
      if (error) {
        if (error.code === "42501") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You can't update this draw." });
        }
        throw error;
      }
      if (!data?.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This spotlight is no longer active." });
      }
    }),

  // Host dismisses the current spotlight — a mulligan; does not consume the no-repeat pool (protected)
  clearDraw: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc("clear_spotlight", { p_session_id: input.sessionId });
      if (error) {
        if (rpcErrorIncludes(error, "forbidden")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the host can clear the spotlight." });
        }
        if (rpcErrorIncludes(error, "not_found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
        }
        throw error;
      }
    }),

  // Host-only "already-called" roster — the no-repeat ledger made visible (protected)
  drawHistory: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("get_spotlight_history", { p_session_id: input.sessionId });
      if (error) {
        if (rpcErrorIncludes(error, "forbidden")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the host can see spotlight history." });
        }
        if (rpcErrorIncludes(error, "not_found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
        }
        throw error;
      }
      // Postgres BIGINT serializes as a JSON string — coerce like tally does
      return ((data ?? []) as SpotlightHistoryRow[]).map((r) => ({
        ...r,
        draw_count: Number(r.draw_count),
        participant_count: Number(r.participant_count),
      }));
    }),

  // Toggle your own "open to being called on" consent while in the lobby/room (protected)
  setCallable: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), callable: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // A non-participant's UPDATE matches 0 rows under RLS (silent no-op); the
      // toggle is optimistic and re-synced from bySessionId, so no row-count guard.
      const { error } = await ctx.supabase
        .from("live_participants")
        .update({ callable: input.callable })
        .eq("session_id", input.sessionId)
        .eq("user_id", ctx.user.id);
      if (error) throw error;
    }),

  // ===== Live Quiz (Sprint 3) =====

  // Host pushes a quiz_questions row to the room (snapshotted into a round) (protected)
  pushQuizQuestion: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), quizQuestionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("push_live_quiz_round", {
        p_session_id: input.sessionId,
        p_quiz_question_id: input.quizQuestionId,
      });
      if (error) {
        if (rpcErrorIncludes(error, "forbidden")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the host can run the quiz." });
        }
        if (rpcErrorIncludes(error, "session_closed")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Open voting before running the quiz." });
        }
        if (rpcErrorIncludes(error, "question_topic_mismatch")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "That question isn't from this session's topic." });
        }
        if (rpcErrorIncludes(error, "question_not_found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Quiz question not found." });
        }
        if (rpcErrorIncludes(error, "not_found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
        }
        throw error;
      }
      return data?.[0] ?? null;
    }),

  // The current quiz round (or null) — correct answer withheld until reveal (protected)
  currentQuizRound: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("get_current_quiz_round", { p_session_id: input.sessionId });
      if (error) {
        if (rpcErrorIncludes(error, "forbidden")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Join the session to see the quiz." });
        }
        if (rpcErrorIncludes(error, "not_found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
        }
        throw error;
      }
      const round = (data?.[0] ?? null) as CurrentQuizRound | null;
      // The round froze the English text at push time; overlay zh-TW via the source
      // quiz_question_id (question_text / option text / explanation — never the
      // correct_answer label, which grading depends on).
      return overlayOne(ctx.supabase, ctx.locale, "quiz_question", round, { idKey: "quiz_question_id" });
    }),

  // Submit an answer to the current round — first answer wins (lock-in) (protected)
  submitQuizAnswer: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), roundId: z.string().uuid(), answer: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc("submit_live_quiz_answer", {
        p_session_id: input.sessionId,
        p_round_id: input.roundId,
        p_answer: input.answer,
      });
      if (error) {
        if (rpcErrorIncludes(error, "round_closed")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This question is closed." });
        }
        if (rpcErrorIncludes(error, "forbidden")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Join the session to answer." });
        }
        if (rpcErrorIncludes(error, "not_found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
        }
        throw error;
      }
    }),

  // Host reveals the round — grades + speed-scores every answer (protected)
  revealQuizRound: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), roundId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc("reveal_live_quiz_round", {
        p_session_id: input.sessionId,
        p_round_id: input.roundId,
      });
      if (error) {
        if (rpcErrorIncludes(error, "forbidden")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the host can reveal answers." });
        }
        if (rpcErrorIncludes(error, "not_found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Round not found." });
        }
        throw error;
      }
    }),

  // Per-round answer distribution — host anytime, room once revealed (protected)
  quizAggregate: protectedProcedure
    .input(z.object({ roundId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("get_live_quiz_aggregate", { p_round_id: input.roundId });
      if (error) {
        if (rpcErrorIncludes(error, "forbidden")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Answers appear once the host reveals them." });
        }
        if (rpcErrorIncludes(error, "not_found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Round not found." });
        }
        throw error;
      }
      return ((data ?? []) as QuizAggregateRow[]).map((r) => ({
        answer_label: r.answer_label,
        vote_count: Number(r.vote_count),
      }));
    }),

  // Cumulative leaderboard — host anytime; room when public + a round revealed (protected)
  quizLeaderboard: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("get_live_quiz_leaderboard", { p_session_id: input.sessionId });
      if (error) {
        if (rpcErrorIncludes(error, "forbidden")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "The leaderboard isn't open yet." });
        }
        if (rpcErrorIncludes(error, "not_found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
        }
        throw error;
      }
      return ((data ?? []) as QuizLeaderboardRow[]).map((r) => ({
        user_id: r.user_id,
        display_name: r.display_name,
        total_score: Number(r.total_score),
        correct_count: Number(r.correct_count),
      }));
    }),

  // Host toggles whether the room sees the named leaderboard (protected)
  setQuizLeaderboardPublic: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), isPublic: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("live_sessions")
        .update({ quiz_leaderboard_public: input.isPublic, updated_at: new Date().toISOString() })
        .eq("id", input.sessionId)
        .eq("host_id", ctx.user.id); // RLS-equivalent host guard
      if (error) throw error;
    }),

  // ===== Scheduling (Sprint 5) =====

  // Host schedules the session for a future time and optionally publishes it (protected)
  schedule: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), startsAt: z.string().datetime(), publish: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc("schedule_live_session", {
        p_session_id: input.sessionId,
        p_starts_at: input.startsAt,
        p_publish: input.publish ?? true,
      });
      if (error) {
        if (rpcErrorIncludes(error, "forbidden")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the host can schedule." });
        }
        if (rpcErrorIncludes(error, "session_closed")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Schedule before opening the session." });
        }
        if (rpcErrorIncludes(error, "not_found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
        }
        throw error;
      }
    }),

  // RSVP to a published scheduled session (protected)
  rsvp: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc("rsvp_live_session", { p_session_id: input.sessionId });
      if (error) {
        if (rpcErrorIncludes(error, "not_published")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This session isn't open for RSVPs yet." });
        }
        if (rpcErrorIncludes(error, "profile_missing")) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Your account profile is incomplete — try signing out and back in." });
        }
        if (rpcErrorIncludes(error, "not_found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
        }
        throw error;
      }
    }),

  // Withdraw your RSVP — own-row DELETE (protected)
  withdrawRsvp: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("live_rsvps")
        .delete()
        .eq("session_id", input.sessionId)
        .eq("user_id", ctx.user.id);
      if (error) throw error;
    }),

  // The caller's upcoming RSVPs (definer RPC — an RSVP isn't a participant) (protected)
  myRsvps: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase.rpc("get_my_upcoming_rsvps");
    if (error) throw error;
    return data ?? [];
  }),

  // Post-session recap aggregates — host anytime; members once revealed/ended (protected)
  recapSummary: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("get_session_recap", { p_session_id: input.sessionId });
      if (error) {
        if (rpcErrorIncludes(error, "forbidden")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "The recap opens once the host reveals results." });
        }
        if (rpcErrorIncludes(error, "not_found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
        }
        throw error;
      }
      const r = data?.[0];
      if (!r) return null;
      return {
        participant_count: Number(r.participant_count),
        rsvp_count: Number(r.rsvp_count),
        vote_count: Number(r.vote_count),
        spotlight_count: Number(r.spotlight_count),
        spotlight_shared: Number(r.spotlight_shared),
        quiz_rounds: Number(r.quiz_rounds),
        quiz_answers: Number(r.quiz_answers),
      };
    }),

  // Opportunistic reminder dispatch — the host dashboard fires this near session
  // time. Reminder rows + the pinned reminders_sent_at stamp need service-role
  // (notifications has no INSERT policy); reminders_sent_at makes it idempotent (protected)
  dispatchDueReminders: protectedProcedure.mutation(async ({ ctx }) => {
    const now = Date.now();
    const { data: due } = await ctx.supabase
      .from("live_sessions")
      .select("id, host_id, topic_id")
      .eq("host_id", ctx.user.id)
      .eq("status", "lobby")
      .eq("published", true)
      .is("reminders_sent_at", null)
      .gte("starts_at", new Date(now - 15 * 60 * 1000).toISOString()) // 15-min grace for a just-passed start
      .lte("starts_at", new Date(now + 60 * 60 * 1000).toISOString());
    if (!due?.length) return { dispatched: 0 };

    const admin = getAdminClient();
    let dispatched = 0;
    for (const s of due as { id: string; host_id: string; topic_id: string }[]) {
      // Atomic claim: whoever flips null→timestamp first owns this dispatch (the
      // loser's conditional update matches 0 rows). Closes the double-send race
      // when the host has two tabs open.
      const { data: claimed } = await admin
        .from("live_sessions")
        .update({ reminders_sent_at: new Date().toISOString() })
        .eq("id", s.id)
        .is("reminders_sent_at", null)
        .select("id");
      if (!claimed?.length) continue;

      const { data: rsvps } = await ctx.supabase.from("live_rsvps").select("user_id").eq("session_id", s.id);
      const recipients = new Set<string>([s.host_id, ...((rsvps ?? []) as { user_id: string }[]).map((r) => r.user_id)]);
      const rows = [...recipients].map((uid) => ({ user_id: uid, type: "session_reminder", session_id: s.id, topic_id: s.topic_id }));
      const { error: insErr } = await admin.from("notifications").insert(rows);
      if (insErr) {
        // Stay claimed (no infinite retry spin); surface for observability
        console.error("[live] reminder insert failed", s.id, insErr.message);
        continue;
      }
      dispatched++;
    }
    return { dispatched };
  }),

  // Sessions hosted by the caller — the lost-projector-tab recovery list on /live (protected)
  mySessions: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("live_sessions")
      .select("id, code, status, created_at, starts_at, published, topic:topics(id, title, slug)")
      .eq("host_id", ctx.user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return data ?? [];
  }),
});
