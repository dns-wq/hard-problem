import { z } from "zod";
import { createTRPCRouter, publicProcedure, adminProcedure } from "@/lib/trpc/server";

export const papersRouter = createTRPCRouter({
  // List papers for a topic (public)
  byTopic: publicProcedure
    .input(z.object({ topicId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("papers")
        .select("id, topic_id, role, title, authors, year, source_url, pdf_url, abstract, is_open_access, display_order, created_at")
        .eq("topic_id", input.topicId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    }),

  // Admin: list papers for a topic (includes extraction status)
  adminByTopic: adminProcedure
    .input(z.object({ topicId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("papers")
        .select("id, topic_id, role, title, authors, year, source_url, pdf_url, abstract, is_open_access, display_order, created_at, full_extracted_text")
        .eq("topic_id", input.topicId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((p) => ({ ...p, hasExtraction: !!p.full_extracted_text }));
    }),

  // Admin: create paper
  create: adminProcedure
    .input(
      z.object({
        topic_id: z.string().uuid(),
        role: z.enum(["focal", "counter", "supplementary"]),
        title: z.string().min(1),
        authors: z.string().min(1),
        year: z.number().int().min(1900).max(2100).optional(),
        source_url: z.string().url(),
        pdf_url: z.string().url().optional(),
        abstract: z.string().optional(),
        is_open_access: z.boolean().default(false),
        display_order: z.number().int().default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("papers")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  // Admin: update paper metadata
  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        role: z.enum(["focal", "counter", "supplementary"]).optional(),
        title: z.string().min(1).optional(),
        authors: z.string().min(1).optional(),
        year: z.number().int().optional(),
        source_url: z.string().url().optional(),
        pdf_url: z.string().url().nullable().optional(),
        abstract: z.string().optional(),
        is_open_access: z.boolean().optional(),
        display_order: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const { data, error } = await ctx.supabase
        .from("papers")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  // Admin: save Docling-extracted text (used for RAG — not displayed to users)
  updateExtractedText: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        full_extracted_text: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("papers")
        .update({ full_extracted_text: input.full_extracted_text })
        .eq("id", input.id);
      if (error) throw error;
      return { success: true };
    }),

  // Admin: delete paper
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("papers")
        .delete()
        .eq("id", input.id);
      if (error) throw error;
    }),
});
