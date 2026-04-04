import { z } from "zod";
import { createTRPCRouter, publicProcedure, adminProcedure, protectedProcedure } from "@/lib/trpc/server";

export const topicsRouter = createTRPCRouter({
  // List published topics with optional filters and cursor pagination
  list: publicProcedure
    .input(
      z.object({
        domain: z.string().optional(),
        difficulty: z.enum(["accessible", "intermediate", "advanced"]).optional(),
        search: z.string().optional(),
        cursor: z.string().uuid().optional(),
        limit: z.number().min(1).max(50).default(20),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("topics")
        .select("*")
        .eq("status", "published")
        .order("sequence_number", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(input?.limit ?? 20);

      if (input?.domain) {
        query = query.contains("domains", [input.domain]);
      }
      if (input?.difficulty) {
        query = query.eq("difficulty", input.difficulty);
      }
      if (input?.search) {
        query = query.textSearch("title", input.search, { type: "websearch" });
      }
      if (input?.cursor) {
        query = query.lt("id", input.cursor);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    }),

  // Get a single topic by slug (published only for public; drafts for editors)
  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("topics")
        .select("*")
        .eq("slug", input.slug)
        .single();
      if (error) throw error;
      return data;
    }),

  // Admin: list all topics regardless of status
  adminList: adminProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("topics")
      .select("*")
      .order("sequence_number", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data ?? [];
  }),

  // Admin: get topic by id
  adminById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("topics")
        .select("*")
        .eq("id", input.id)
        .single();
      if (error) throw error;
      return data;
    }),

  // Admin: create topic
  create: adminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
        framing_note: z.string().default(""),
        discussion_prompt: z.string().default(""),
        real_world_anchor: z.object({
          title: z.string(),
          body: z.string(),
          source_url: z.string().optional(),
          date: z.string().optional(),
        }).default({ title: "", body: "" }),
        difficulty: z.enum(["accessible", "intermediate", "advanced"]).default("intermediate"),
        domains: z.array(z.string()).default([]),
        sequence_number: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("topics")
        .insert({ ...input, status: "draft" })
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  // Admin: update topic
  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
        framing_note: z.string().optional(),
        discussion_prompt: z.string().optional(),
        real_world_anchor: z.object({
          title: z.string(),
          body: z.string(),
          source_url: z.string().optional(),
          date: z.string().optional(),
        }).optional(),
        difficulty: z.enum(["accessible", "intermediate", "advanced"]).optional(),
        domains: z.array(z.string()).optional(),
        sequence_number: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const { data, error } = await ctx.supabase
        .from("topics")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  // Admin: publish topic
  publish: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("topics")
        .update({ status: "published", updated_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
    }),

  // Admin: archive topic
  archive: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("topics")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
    }),

  // Get contribution count and active reader count for a topic (public)
  stats: publicProcedure
    .input(z.object({ topicId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [{ count: contributionCount }, { count: activeReaderCount }] = await Promise.all([
        ctx.supabase
          .from("contributions")
          .select("*", { count: "exact", head: true })
          .eq("topic_id", input.topicId)
          .eq("is_removed", false)
          .then((r) => ({ count: r.count ?? 0 })),
        ctx.supabase
          .from("user_progress")
          .select("*", { count: "exact", head: true })
          .eq("topic_id", input.topicId)
          .gte("last_visited", twentyFourHoursAgo)
          .then((r) => ({ count: r.count ?? 0 })),
      ]);

      return { contributionCount, activeReaderCount };
    }),

  // Get user's progress for a specific topic (protected)
  myProgress: protectedProcedure
    .input(z.object({ topicId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data } = await ctx.supabase
        .from("user_progress")
        .select("*")
        .eq("user_id", ctx.user.id)
        .eq("topic_id", input.topicId)
        .single();
      return data;
    }),
});
