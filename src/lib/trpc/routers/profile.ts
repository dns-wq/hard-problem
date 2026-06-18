import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/lib/trpc/server";
import { evaluateStamps } from "@/lib/stamps";
import type { LiveTranscriptCounts } from "@/types/database";

// Coerce the get_live_transcript row (BIGINT → string over PostgREST) to numbers.
function transcriptCounts(row: Record<string, unknown> | undefined): LiveTranscriptCounts {
  return {
    sessions_attended: Number(row?.sessions_attended ?? 0),
    votes_cast: Number(row?.votes_cast ?? 0),
    times_spotlighted: Number(row?.times_spotlighted ?? 0),
    times_shared: Number(row?.times_shared ?? 0),
    steelman_count: Number(row?.steelman_count ?? 0),
    quiz_passed_topics: Number(row?.quiz_passed_topics ?? 0),
  };
}

export const profileRouter = createTRPCRouter({
  // Get the current user's full profile
  me: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("users")
      .select("*")
      .eq("id", ctx.user.id)
      .single();
    if (error) throw error;
    return data;
  }),

  // Update the current user's profile
  update: protectedProcedure
    .input(
      z.object({
        display_name: z.string().min(1).max(80).optional(),
        bio: z.string().max(500).nullable().optional(),
        live_transcript_public: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("users")
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", ctx.user.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  // The current user's live-session transcript (scalar counts) + earned stamps (protected)
  liveTranscript: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase.rpc("get_live_transcript", { p_user_id: ctx.user.id });
    if (error) throw error;
    const row = data?.[0];
    const counts = transcriptCounts(row);
    return { counts, stamps: evaluateStamps(counts), isPublic: !!row?.is_public };
  }),

  // Get aggregated progress stats for the current user
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [progressResult, builtUponResult] = await Promise.all([
      ctx.supabase
        .from("user_progress")
        .select("topic_id, contributed, contribution_count, built_upon_count, quiz_passed")
        .eq("user_id", ctx.user.id),
      ctx.supabase
        .from("user_progress")
        .select("built_upon_count")
        .eq("user_id", ctx.user.id),
    ]);

    const progress = progressResult.data ?? [];
    const totalContributions = progress.reduce((sum, p) => sum + (p.contribution_count ?? 0), 0);
    const totalBuiltUpon = progress.reduce((sum, p) => sum + (p.built_upon_count ?? 0), 0);
    const topicsEngaged = progress.filter((p) => p.contributed).length;

    return {
      topicsEngaged,
      totalContributions,
      totalBuiltUpon,
      progress,
    };
  }),

  // Get a public profile by display_name (URL-safe slug)
  publicProfile: publicProcedure
    .input(z.object({ displayName: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: user, error } = await ctx.supabase
        .from("users")
        .select("id, display_name, bio, created_at")
        .ilike("display_name", input.displayName)
        .single();
      if (error) throw error;

      const [{ data: contributions }, { data: transcriptRows }] = await Promise.all([
        ctx.supabase
          .from("contributions")
          .select(`
            id, topic_id, body, stance_tag, created_at,
            topic:topics(id, title, slug)
          `)
          .eq("user_id", user.id)
          .is("parent_id", null)
          .eq("is_removed", false)
          .order("created_at", { ascending: false })
          .limit(20),
        // Authenticated-only RPC: a logged-out viewer gets {data:null} (no throw)
        // and simply sees no transcript. A logged-in viewer sees it only if the
        // target opted in (is_public) — otherwise the row degrades to all-zero.
        ctx.supabase.rpc("get_live_transcript", { p_user_id: user.id }),
      ]);

      const tRow = transcriptRows?.[0] as Record<string, unknown> | undefined;
      const tCounts = transcriptCounts(tRow);
      const transcript = tRow?.is_public ? { counts: tCounts, stamps: evaluateStamps(tCounts) } : null;

      return { user, contributions: contributions ?? [], transcript };
    }),

  // Get the current user's contribution history
  myContributions: protectedProcedure
    .input(z.object({ cursor: z.string().optional(), limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("contributions")
        .select(`
          id, topic_id, body, stance_tag, created_at,
          topic:topics(id, title, slug)
        `)
        .eq("user_id", ctx.user.id)
        .is("parent_id", null)
        .eq("is_removed", false)
        .order("created_at", { ascending: false })
        .limit(input.limit);

      if (input.cursor) {
        query = query.lt("created_at", input.cursor);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    }),
});
