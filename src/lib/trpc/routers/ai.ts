import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/server";
import { assertProSubscription, assertQuizPassed } from "@/lib/trpc/server";
import { retrieveRelevantChunks } from "@/lib/rag";
import { callClaude } from "@/lib/anthropic";

export const aiRouter = createTRPCRouter({
  // Check whether the user can access the AI panel for a topic
  checkAccess: protectedProcedure
    .input(z.object({ topicId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [userResult, progressResult] = await Promise.all([
        ctx.supabase
          .from("users")
          .select("subscription_status, subscription_tier")
          .eq("id", ctx.user.id)
          .single(),
        ctx.supabase
          .from("user_progress")
          .select("quiz_passed")
          .eq("user_id", ctx.user.id)
          .eq("topic_id", input.topicId)
          .single(),
      ]);

      const user = userResult.data;
      const hasSubscription =
        user?.subscription_tier === "pro" &&
        ["active", "trialing"].includes(user?.subscription_status ?? "");

      const quizPassed = progressResult.data?.quiz_passed ?? false;

      return { hasSubscription, quizPassed };
    }),

  // Get or create a conversation for a user/topic pair
  getOrCreateConversation: protectedProcedure
    .input(z.object({ topicId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check existing
      const { data: existing } = await ctx.supabase
        .from("ai_conversations")
        .select("*")
        .eq("user_id", ctx.user.id)
        .eq("topic_id", input.topicId)
        .single();

      if (existing) return existing;

      // Create new
      const { data, error } = await ctx.supabase
        .from("ai_conversations")
        .insert({
          user_id: ctx.user.id,
          topic_id: input.topicId,
          messages: [],
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  // Send a message — requires pro subscription + quiz passed for the topic
  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        topicId: z.string().uuid(),
        message: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Gate checks (order matters: subscription first, then quiz)
      await assertProSubscription(ctx.supabase, ctx.user.id);
      await assertQuizPassed(ctx.supabase, ctx.user.id, input.topicId);

      // Fetch conversation
      const { data: conversation } = await ctx.supabase
        .from("ai_conversations")
        .select("*")
        .eq("id", input.conversationId)
        .eq("user_id", ctx.user.id)
        .single();

      if (!conversation) {
        throw new Error("Conversation not found.");
      }

      // Retrieve relevant chunks from paper embeddings
      const chunks = await retrieveRelevantChunks(input.message, input.topicId, 6);

      // Build system prompt
      const chunkContext = chunks
        .map((c, i) => `[${i + 1}] ${c.chunk_text}`)
        .join("\n\n");

      const systemPrompt = `You are a philosophical thinking partner helping a STEM professional engage with academic papers on technology ethics. Your role is to help the user clarify their own reasoning — not to lecture or provide authoritative answers.

You are grounded in the following source material for this topic:

${chunkContext}

Guidelines:
- Help the user sharpen their arguments and identify assumptions
- When you draw on the source material, cite it by number (e.g., "[1]")
- Present multiple philosophical perspectives when relevant
- Use Socratic questioning: ask the user to consider implications, counter-examples, and alternative frameworks
- If the source material doesn't address the user's question, say so explicitly rather than generating from general knowledge
- Never be condescending about the user's philosophical knowledge
- Connect abstract concepts to technical and practical implications when possible`;

      // Build messages for Claude (prior conversation + new user message)
      const priorMessages = (conversation.messages as { role: string; content: string }[]).map(
        (m) => ({ role: m.role as "user" | "assistant", content: m.content }),
      );

      const allMessages = [
        ...priorMessages,
        { role: "user" as const, content: input.message },
      ];

      // Call Claude
      const assistantContent = await callClaude(systemPrompt, allMessages);

      // Persist updated conversation
      const now = new Date().toISOString();
      const updatedMessages = [
        ...(conversation.messages as object[]),
        { role: "user", content: input.message, timestamp: now },
        { role: "assistant", content: assistantContent, timestamp: now, citations: chunks },
      ];

      await ctx.supabase
        .from("ai_conversations")
        .update({ messages: updatedMessages, updated_at: now })
        .eq("id", input.conversationId);

      return {
        content: assistantContent,
        citations: chunks,
      };
    }),

  // Submit quiz answers — grades and updates quiz_passed if all correct
  submitQuiz: protectedProcedure
    .input(
      z.object({
        topicId: z.string().uuid(),
        answers: z.record(z.string().uuid(), z.string()), // { questionId: answer }
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch questions WITH correct answers (admin-only fields — safe here because this is server-side)
      const { data: questions, error } = await ctx.supabase
        .from("quiz_questions")
        .select("id, question_text, correct_answer, explanation")
        .eq("topic_id", input.topicId)
        .order("display_order");
      if (error) throw error;
      if (!questions || questions.length === 0) return { passed: true, results: [] };

      // Grade each answer
      const results = questions.map((q) => {
        const given = (input.answers[q.id] ?? "").toLowerCase().trim();
        const correct = q.correct_answer.toLowerCase().trim();
        const isCorrect = given === correct;
        return {
          questionId: q.id,
          correct: isCorrect,
          explanation: q.explanation ?? null,
        };
      });

      const passed = results.every((r) => r.correct);

      if (passed) {
        await ctx.supabase
          .from("user_progress")
          .upsert(
            {
              user_id: ctx.user.id,
              topic_id: input.topicId,
              quiz_passed: true,
              last_visited: new Date().toISOString(),
            },
            { onConflict: "user_id,topic_id", ignoreDuplicates: false },
          );
      }

      return { passed, results };
    }),
});
