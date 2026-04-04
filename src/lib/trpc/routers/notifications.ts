import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/server";

export const notificationsRouter = createTRPCRouter({
  // List recent notifications for the current user
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("notifications")
        .select(`
          *,
          actor:users!actor_id(id, display_name),
          topic:topics(id, title, slug)
        `)
        .eq("user_id", ctx.user.id)
        .order("created_at", { ascending: false })
        .limit(input?.limit ?? 20);
      if (error) throw error;
      return data ?? [];
    }),

  // Count unread notifications
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const { count, error } = await ctx.supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", ctx.user.id)
      .eq("is_read", false);
    if (error) throw error;
    return count ?? 0;
  }),

  // Mark all notifications as read
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const { error } = await ctx.supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", ctx.user.id)
      .eq("is_read", false);
    if (error) throw error;
  }),

  // Mark a single notification as read
  markRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", input.id)
        .eq("user_id", ctx.user.id);
      if (error) throw error;
    }),
});
