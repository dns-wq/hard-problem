import { z } from "zod";
import { createTRPCRouter, publicProcedure, adminProcedure } from "@/lib/trpc/server";

export const conceptsRouter = createTRPCRouter({
  // List all concepts (public)
  list: publicProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("concepts")
      .select("*")
      .order("term", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }),

  // Get concept by slug (public)
  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("concepts")
        .select("*")
        .eq("slug", input.slug)
        .single();
      if (error) throw error;
      return data;
    }),

  // List concepts for a topic (public)
  byTopic: publicProcedure
    .input(z.object({ topicId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("topic_concepts")
        .select("concept_id, concepts(*)")
        .eq("topic_id", input.topicId);
      if (error) throw error;
      return (data ?? []).map((row) => row.concepts).filter(Boolean);
    }),

  // Admin: create concept
  create: adminProcedure
    .input(
      z.object({
        term: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
        definition: z.string().min(1),
        examples: z.string().optional(),
        related_terms: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("concepts")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  // Admin: update concept
  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        term: z.string().min(1).optional(),
        definition: z.string().min(1).optional(),
        examples: z.string().optional(),
        related_terms: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const { data, error } = await ctx.supabase
        .from("concepts")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  // Admin: link concept to topic
  linkToTopic: adminProcedure
    .input(z.object({ topicId: z.string().uuid(), conceptId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("topic_concepts")
        .insert({ topic_id: input.topicId, concept_id: input.conceptId });
      if (error && error.code !== "23505") throw error; // ignore duplicate
    }),

  // Admin: unlink concept from topic
  unlinkFromTopic: adminProcedure
    .input(z.object({ topicId: z.string().uuid(), conceptId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("topic_concepts")
        .delete()
        .eq("topic_id", input.topicId)
        .eq("concept_id", input.conceptId);
      if (error) throw error;
    }),

  // Admin: delete concept
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("concepts")
        .delete()
        .eq("id", input.id);
      if (error) throw error;
    }),
});
