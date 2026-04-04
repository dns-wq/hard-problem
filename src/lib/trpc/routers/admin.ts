import { z } from "zod";
import { createTRPCRouter, adminProcedure } from "@/lib/trpc/server";

export const adminRouter = createTRPCRouter({
  // Dashboard stats
  stats: adminProcedure.query(async ({ ctx }) => {
    const [topicsResult, flaggedResult] = await Promise.all([
      ctx.supabase
        .from("topics")
        .select("status")
        .then(({ data }) => {
          const counts = { draft: 0, published: 0, archived: 0 };
          for (const t of data ?? []) counts[t.status as keyof typeof counts]++;
          return counts;
        }),
      ctx.supabase
        .from("contributions")
        .select("*", { count: "exact", head: true })
        .eq("is_flagged", true)
        .eq("is_removed", false)
        .then(({ count }) => count ?? 0),
    ]);

    return { topics: topicsResult, flaggedContributions: flaggedResult };
  }),

  // Moderation queue: flagged contributions not yet removed
  flaggedContributions: adminProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("contributions")
      .select(`
        *,
        author:users!user_id(id, display_name),
        topic:topics(id, title, slug)
      `)
      .eq("is_flagged", true)
      .eq("is_removed", false)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }),

  // Dismiss flag (mark as reviewed, not removed)
  dismissFlag: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("contributions")
        .update({ is_flagged: false })
        .eq("id", input.id);
      if (error) throw error;
    }),

  // Remove contribution (soft delete + notify author)
  removeContribution: adminProcedure
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

      if (contribution) {
        await ctx.supabase.from("notifications").insert({
          user_id: contribution.user_id,
          type: "moderation",
          contribution_id: input.id,
          topic_id: contribution.topic_id,
        });
      }
    }),

  // Merge stance tags: update all contributions using the deprecated tag to the canonical tag
  mergeStanceTags: adminProcedure
    .input(
      z.object({
        deprecated: z.string().min(1),
        canonical: z.string().min(1),
        topicId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("contributions")
        .update({ stance_tag: input.canonical })
        .eq("topic_id", input.topicId)
        .ilike("stance_tag", input.deprecated);
      if (error) throw error;
    }),

  // List all stance tags across a topic with counts (for merge tool)
  stanceTagsForTopic: adminProcedure
    .input(z.object({ topicId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("contributions")
        .select("stance_tag")
        .eq("topic_id", input.topicId)
        .not("stance_tag", "is", null);
      if (error) throw error;

      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        if (!row.stance_tag) continue;
        counts.set(row.stance_tag, (counts.get(row.stance_tag) ?? 0) + 1);
      }

      return Array.from(counts.entries())
        .sort(([, a], [, b]) => b - a)
        .map(([tag, count]) => ({ tag, count }));
    }),
});
