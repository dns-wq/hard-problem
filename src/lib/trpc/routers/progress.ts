import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/server";

export const progressRouter = createTRPCRouter({
  // Record that the user opened a paper (marks paper_opened or counter_opened)
  recordOpen: protectedProcedure
    .input(
      z.object({
        topicId: z.string().uuid(),
        paperRole: z.enum(["focal", "counter", "supplementary"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const update: Record<string, unknown> = {
        user_id: ctx.user.id,
        topic_id: input.topicId,
        last_visited: new Date().toISOString(),
      };

      if (input.paperRole === "focal") update.paper_opened = true;
      if (input.paperRole === "counter") update.counter_opened = true;

      await ctx.supabase
        .from("user_progress")
        .upsert(update, { onConflict: "user_id,topic_id", ignoreDuplicates: false });
    }),

  // Record a topic page visit (updates last_visited)
  recordVisit: protectedProcedure
    .input(z.object({ topicId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.supabase
        .from("user_progress")
        .upsert(
          {
            user_id: ctx.user.id,
            topic_id: input.topicId,
            last_visited: new Date().toISOString(),
          },
          { onConflict: "user_id,topic_id", ignoreDuplicates: false },
        );
    }),

  // Get current user's progress across all topics
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("user_progress")
      .select("*")
      .eq("user_id", ctx.user.id);
    if (error) throw error;
    return data ?? [];
  }),

  // Get progress for a specific topic
  getByTopic: protectedProcedure
    .input(z.object({ topicId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data } = await ctx.supabase
        .from("user_progress")
        .select("*")
        .eq("user_id", ctx.user.id)
        .eq("topic_id", input.topicId)
        .single();
      return data ?? null;
    }),
});
