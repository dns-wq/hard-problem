import { createTRPCRouter } from "@/lib/trpc/server";
import { topicsRouter } from "@/lib/trpc/routers/topics";
import { papersRouter } from "@/lib/trpc/routers/papers";
import { conceptsRouter } from "@/lib/trpc/routers/concepts";
import { contributionsRouter } from "@/lib/trpc/routers/contributions";
import { progressRouter } from "@/lib/trpc/routers/progress";
import { quizRouter } from "@/lib/trpc/routers/quiz";
import { notificationsRouter } from "@/lib/trpc/routers/notifications";
import { profileRouter } from "@/lib/trpc/routers/profile";
import { aiRouter } from "@/lib/trpc/routers/ai";
import { adminRouter } from "@/lib/trpc/routers/admin";

export const appRouter = createTRPCRouter({
  topics: topicsRouter,
  papers: papersRouter,
  concepts: conceptsRouter,
  contributions: contributionsRouter,
  progress: progressRouter,
  quiz: quizRouter,
  notifications: notificationsRouter,
  profile: profileRouter,
  ai: aiRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
