import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure, adminProcedure } from "@/lib/trpc/server";

// Zod schema for creating a contribution — enforces the three-type discriminated union.
// Note: z.discriminatedUnion with z.null() discriminator is tricky in Zod v4.
// Using a union of objects with .refine() as a safer fallback.
const createContributionInput = z.union([
  // Top-level contribution
  z.object({
    topic_id: z.string().uuid(),
    relationship_type: z.null(),
    parent_id: z.null().optional(),
    body: z.string().min(1).max(2000),
    reaction_type: z.null().optional(),
    stance_tag: z.string().max(100).nullable().optional(),
  }),
  // Build-on contribution
  z.object({
    topic_id: z.string().uuid(),
    relationship_type: z.literal("build_on"),
    parent_id: z.string().uuid(),
    body: z.string().min(1).max(2000),
    reaction_type: z.null().optional(),
    stance_tag: z.null().optional(),
  }),
  // Preset reply
  z.object({
    topic_id: z.string().uuid(),
    relationship_type: z.literal("reply"),
    parent_id: z.string().uuid(),
    body: z.null().optional(),
    reaction_type: z.enum(["great_point", "interesting", "i_disagree", "thumbs_up"]),
    stance_tag: z.null().optional(),
  }),
]);

export const contributionsRouter = createTRPCRouter({
  // List top-level contributions for a topic, with nested replies
  listByTopic: publicProcedure
    .input(
      z.object({
        topicId: z.string().uuid(),
        sortBy: z.enum(["recent", "stance"]).default("recent"),
        stanceFilter: z.string().optional(),
        cursor: z.string().uuid().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Fetch top-level contributions (parent_id IS NULL)
      let topLevelQuery = ctx.supabase
        .from("contributions")
        .select(`
          *,
          author:users(id, display_name)
        `)
        .eq("topic_id", input.topicId)
        .is("parent_id", null)
        .eq("is_removed", false)
        .order("created_at", { ascending: false })
        .limit(input.limit);

      if (input.stanceFilter) {
        topLevelQuery = topLevelQuery.eq("stance_tag", input.stanceFilter);
      }
      if (input.cursor) {
        topLevelQuery = topLevelQuery.lt("created_at", input.cursor);
      }

      const { data: topLevel, error: tlError } = await topLevelQuery;
      if (tlError) throw tlError;
      if (!topLevel || topLevel.length === 0) return [];

      // Fetch all replies for these top-level contributions in one query
      const parentIds = topLevel.map((c) => c.id);
      const { data: replies, error: replyError } = await ctx.supabase
        .from("contributions")
        .select(`
          *,
          actor:users(id, display_name)
        `)
        .in("parent_id", parentIds)
        .eq("is_removed", false)
        .order("created_at", { ascending: true });

      if (replyError) throw replyError;

      // Attach replies to their parent contributions
      const replyMap = new Map<string, typeof replies>();
      for (const reply of replies ?? []) {
        if (!replyMap.has(reply.parent_id)) {
          replyMap.set(reply.parent_id, []);
        }
        replyMap.get(reply.parent_id)!.push(reply);
      }

      return topLevel.map((c) => ({
        ...c,
        replies: replyMap.get(c.id) ?? [],
      }));
    }),

  // Get stance tag distribution for a topic
  stanceTags: publicProcedure
    .input(z.object({ topicId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("contributions")
        .select("stance_tag")
        .eq("topic_id", input.topicId)
        .is("parent_id", null)
        .eq("is_removed", false)
        .not("stance_tag", "is", null);

      if (error) throw error;

      // Count occurrences of each stance tag (case-insensitive grouping)
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        if (!row.stance_tag) continue;
        const key = row.stance_tag.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      // Return sorted by count descending, preserving original casing from first occurrence
      const tagCasing = new Map<string, string>();
      for (const row of data ?? []) {
        if (!row.stance_tag) continue;
        const key = row.stance_tag.toLowerCase();
        if (!tagCasing.has(key)) tagCasing.set(key, row.stance_tag);
      }

      return Array.from(counts.entries())
        .sort(([, a], [, b]) => b - a)
        .map(([key, count]) => ({ tag: tagCasing.get(key) ?? key, count }));
    }),

  // Create a contribution (protected)
  create: protectedProcedure
    .input(createContributionInput)
    .mutation(async ({ ctx, input }) => {
      // For build_on: verify parent exists, is top-level, and belongs to the same topic
      if (input.relationship_type === "build_on") {
        const { data: parent } = await ctx.supabase
          .from("contributions")
          .select("id, topic_id, user_id, parent_id, display_name:users(display_name)")
          .eq("id", input.parent_id)
          .single();

        if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Parent contribution not found." });
        if (parent.topic_id !== input.topic_id) throw new TRPCError({ code: "BAD_REQUEST", message: "Parent contribution is from a different topic." });
        if (parent.parent_id !== null) throw new TRPCError({ code: "BAD_REQUEST", message: "Can only build on top-level contributions." });
      }

      // For reply: verify parent exists and belongs to the same topic
      if (input.relationship_type === "reply") {
        const { data: parent } = await ctx.supabase
          .from("contributions")
          .select("id, topic_id, user_id")
          .eq("id", input.parent_id)
          .single();

        if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Parent contribution not found." });
        if (parent.topic_id !== input.topic_id) throw new TRPCError({ code: "BAD_REQUEST", message: "Parent contribution is from a different topic." });
      }

      const { data: contribution, error } = await ctx.supabase
        .from("contributions")
        .insert({
          topic_id: input.topic_id,
          user_id: ctx.user.id,
          parent_id: "parent_id" in input ? input.parent_id : null,
          relationship_type: input.relationship_type ?? null,
          body: "body" in input && input.body ? input.body : null,
          reaction_type: "reaction_type" in input ? input.reaction_type : null,
          stance_tag: "stance_tag" in input ? input.stance_tag : null,
        })
        .select()
        .single();

      if (error) throw error;

      // Notify parent author + increment built_upon_count for build_on
      if (
        (input.relationship_type === "build_on" || input.relationship_type === "reply") &&
        "parent_id" in input
      ) {
        const { data: parent } = await ctx.supabase
          .from("contributions")
          .select("user_id")
          .eq("id", input.parent_id)
          .single();

        if (parent && parent.user_id !== ctx.user.id) {
          await ctx.supabase.from("notifications").insert({
            user_id: parent.user_id,
            type: input.relationship_type,
            actor_id: ctx.user.id,
            contribution_id: contribution.id,
            topic_id: input.topic_id,
          });
        }

        if (parent && input.relationship_type === "build_on") {
          await ctx.supabase.rpc("increment_built_upon_count", {
            p_user_id: parent.user_id,
            p_topic_id: input.topic_id,
          });
        }
      }

      // Increment contribution_count (also sets contributed=true and last_visited)
      await ctx.supabase.rpc("increment_contribution_count", {
        p_user_id: ctx.user.id,
        p_topic_id: input.topic_id,
      });

      return contribution;
    }),

  // Update own contribution body (protected)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        body: z.string().min(1).max(2000),
        stance_tag: z.string().max(100).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("contributions")
        .update({
          body: input.body,
          stance_tag: input.stance_tag,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("user_id", ctx.user.id) // RLS-equivalent guard
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  // Soft-delete own contribution (protected)
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("contributions")
        .update({ is_removed: true, updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("user_id", ctx.user.id);
      if (error) throw error;
    }),

  // Flag a contribution (protected)
  flag: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("contributions")
        .update({ is_flagged: true })
        .eq("id", input.id);
      if (error) throw error;
    }),

  // Admin: remove a contribution
  adminRemove: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: contribution } = await ctx.supabase
        .from("contributions")
        .select("user_id, topic_id")
        .eq("id", input.id)
        .single();

      const { error } = await ctx.supabase
        .from("contributions")
        .update({ is_removed: true, is_flagged: false, updated_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;

      // Notify the author
      if (contribution) {
        await ctx.supabase.from("notifications").insert({
          user_id: contribution.user_id,
          type: "moderation",
          contribution_id: input.id,
          topic_id: contribution.topic_id,
        });
      }
    }),
});
