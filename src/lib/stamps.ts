import type { LiveTranscriptCounts } from "@/types/database";

// The canonical stamp catalog. Lives in code (not the DB) so thresholds and copy
// retune in one edit, retroactively across all history, with no migration.
// Stamps are derived from the transcript counts (008_live_transcript.sql).

export type StampTier = "bronze" | "silver" | "gold";

export interface Stamp {
  key: string;
  label: string;
  emoji: string;
  description: string;
  tier: StampTier;
  predicate: (c: LiveTranscriptCounts) => boolean;
}

// Ordered most-foundational → most-prestigious.
export const STAMP_CATALOG: Stamp[] = [
  { key: "first_session", label: "First Session", emoji: "🎟️", tier: "bronze", description: "Joined your first live session", predicate: (c) => c.sessions_attended >= 1 },
  { key: "regular", label: "Regular", emoji: "📅", tier: "silver", description: "Joined 5 live sessions", predicate: (c) => c.sessions_attended >= 5 },
  { key: "devoted", label: "Devoted", emoji: "🏛️", tier: "gold", description: "Joined 20 live sessions", predicate: (c) => c.sessions_attended >= 20 },
  { key: "decided", label: "Decided", emoji: "🗳️", tier: "bronze", description: "Cast a live vote", predicate: (c) => c.votes_cast >= 1 },
  { key: "deliberator", label: "Deliberator", emoji: "⚖️", tier: "silver", description: "Cast 10 live votes", predicate: (c) => c.votes_cast >= 10 },
  { key: "spoke_up", label: "Spoke Up", emoji: "🎤", tier: "silver", description: "Shared your reasoning when called on", predicate: (c) => c.times_shared >= 1 },
  { key: "steelman", label: "Steelman", emoji: "🛡️", tier: "gold", description: "Steelmanned a minority view aloud", predicate: (c) => c.steelman_count >= 1 },
  { key: "comprehension", label: "Comprehension", emoji: "✅", tier: "bronze", description: "Passed a topic comprehension quiz", predicate: (c) => c.quiz_passed_topics >= 1 },
  { key: "scholar", label: "Scholar", emoji: "🎓", tier: "gold", description: "Passed 10 topic comprehension quizzes", predicate: (c) => c.quiz_passed_topics >= 10 },
];

export function evaluateStamps(c: LiveTranscriptCounts): Stamp[] {
  return STAMP_CATALOG.filter((s) => s.predicate(c));
}
