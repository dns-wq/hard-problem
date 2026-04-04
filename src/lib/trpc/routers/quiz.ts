import { z } from "zod";
import { createTRPCRouter, publicProcedure, adminProcedure } from "@/lib/trpc/server";

export const quizRouter = createTRPCRouter({
  // List quiz questions for a topic (public — questions must be readable to display them)
  byTopic: publicProcedure
    .input(z.object({ topicId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("quiz_questions")
        .select("id, topic_id, question_text, question_type, options, display_order")
        .eq("topic_id", input.topicId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      // Note: correct_answer and explanation are intentionally excluded from this public query.
      // They are returned only by ai.submitQuiz after grading.
      return data ?? [];
    }),

  // Admin: create quiz question
  create: adminProcedure
    .input(
      z.object({
        topic_id: z.string().uuid(),
        question_text: z.string().min(1),
        question_type: z.enum(["mcq", "true_false"]),
        options: z
          .array(z.object({ label: z.string(), text: z.string() }))
          .optional(),
        correct_answer: z.string().min(1),
        explanation: z.string().optional(),
        display_order: z.number().int().default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("quiz_questions")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  // Admin: update quiz question
  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        question_text: z.string().min(1).optional(),
        question_type: z.enum(["mcq", "true_false"]).optional(),
        options: z
          .array(z.object({ label: z.string(), text: z.string() }))
          .nullable()
          .optional(),
        correct_answer: z.string().optional(),
        explanation: z.string().optional(),
        display_order: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const { data, error } = await ctx.supabase
        .from("quiz_questions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  // Admin: delete quiz question
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("quiz_questions")
        .delete()
        .eq("id", input.id);
      if (error) throw error;
    }),
});
