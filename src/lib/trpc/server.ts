import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";

export const createTRPCContext = async () => {
  const supabase = await createClient();
  const [{ data: { user } }, cookieStore, headerList] = await Promise.all([
    supabase.auth.getUser(),
    cookies(),
    headers(),
  ]);

  // The active content locale for this request — drives the content-translation
  // overlay (src/lib/i18n/contentOverlay.ts). Cookie wins (set by the language
  // switcher / a ?lang= join link); else Accept-Language. Same resolver the root
  // layout uses, so server content and the client UI agree.
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerList.get("accept-language"));

  return { supabase, user, locale };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

// Public procedure — no auth required
export const publicProcedure = t.procedure;

// Protected procedure — requires authenticated user
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: { ...ctx, user: ctx.user },
  });
});

// Admin procedure — requires role IN ('editor', 'admin')
// Note: this checks the users table role column, NOT is_admin boolean (that's PPC's pattern)
export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const { data: profile } = await ctx.supabase
    .from("users")
    .select("role")
    .eq("id", ctx.user.id)
    .single();

  if (!profile || !["editor", "admin"].includes(profile.role)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return next({
    ctx: { ...ctx, user: ctx.user },
  });
});

// Inline assertion helpers for the AI router
// (not middleware — they require per-request topicId input)

export async function assertProSubscription(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data: user } = await supabase
    .from("users")
    .select("subscription_status, subscription_tier")
    .eq("id", userId)
    .single();

  if (
    !user ||
    user.subscription_tier !== "pro" ||
    !["active", "trialing"].includes(user.subscription_status)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "AI Reasoning Partner requires a Pro subscription.",
    });
  }
}

export async function assertQuizPassed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  topicId: string,
) {
  const { data: progress } = await supabase
    .from("user_progress")
    .select("quiz_passed")
    .eq("user_id", userId)
    .eq("topic_id", topicId)
    .single();

  if (!progress?.quiz_passed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Complete the comprehension check to unlock the AI Thinking Partner for this topic.",
    });
  }
}
