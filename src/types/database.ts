// Hard Problem — Database Types
// Mirrors the schema in supabase/migrations/ (001 onward)

export type UserRole = "user" | "editor" | "admin";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "none";
export type SubscriptionTier = "free" | "pro";
export type TopicStatus = "draft" | "published" | "archived";
export type TopicDifficulty = "accessible" | "intermediate" | "advanced";
export type PaperRole = "focal" | "counter" | "supplementary";
export type RelationshipType = "build_on" | "reply";
export type ReactionType = "great_point" | "interesting" | "i_disagree" | "thumbs_up";
export type QuestionType = "mcq" | "true_false";
export type NotificationType = "build_on" | "reply" | "moderation";

export interface User {
  id: string;
  email: string;
  display_name: string;
  bio: string | null;
  role: UserRole;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  subscription_tier: SubscriptionTier;
  subscription_current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface RealWorldAnchor {
  title: string;
  body: string;
  source_url?: string;
  date?: string;
}

export interface Topic {
  id: string;
  title: string;
  slug: string;
  status: TopicStatus;
  framing_note: string;
  discussion_prompt: string;
  real_world_anchor: RealWorldAnchor;
  concepts: string[] | null;
  difficulty: TopicDifficulty;
  domains: string[] | null;
  sequence_number: number | null;
  created_at: string;
  updated_at: string;
}

export interface Paper {
  id: string;
  topic_id: string;
  role: PaperRole;
  title: string;
  authors: string;
  year: number | null;
  source_url: string;
  pdf_url: string | null;
  abstract: string | null;
  is_open_access: boolean;
  full_extracted_text: string | null;
  display_order: number;
  created_at: string;
}

export interface Concept {
  id: string;
  term: string;
  slug: string;
  definition: string;
  examples: string | null;
  related_terms: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface TopicConcept {
  topic_id: string;
  concept_id: string;
}

// Discriminated union for the three contribution types
interface ContributionBase {
  id: string;
  topic_id: string;
  user_id: string;
  is_flagged: boolean;
  is_removed: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields (optional — present when queried with user join)
  author?: Pick<User, "id" | "display_name">;
  reply_count?: number;
}

export interface ContributionTopLevel extends ContributionBase {
  parent_id: null;
  relationship_type: null;
  body: string;
  reaction_type: null;
  stance_tag: string | null;
}

export interface ContributionBuildOn extends ContributionBase {
  parent_id: string;
  relationship_type: "build_on";
  body: string;
  reaction_type: null;
  stance_tag: null;
}

export interface ContributionReply extends ContributionBase {
  parent_id: string;
  relationship_type: "reply";
  body: null;
  reaction_type: ReactionType;
  stance_tag: null;
}

export type Contribution = ContributionTopLevel | ContributionBuildOn | ContributionReply;

export interface UserProgress {
  user_id: string;
  topic_id: string;
  paper_opened: boolean;
  counter_opened: boolean;
  quiz_passed: boolean;
  time_spent_sec: number;
  contributed: boolean;
  contribution_count: number;
  built_upon_count: number;
  first_visited: string;
  last_visited: string;
}

export interface MCQOption {
  label: string; // 'A', 'B', 'C', etc.
  text: string;
}

export interface QuizQuestion {
  id: string;
  topic_id: string;
  question_text: string;
  question_type: QuestionType;
  options: MCQOption[] | null; // null for true_false
  correct_answer: string;      // option label or 'true'/'false'
  explanation: string | null;
  display_order: number;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  actor_id: string | null;
  contribution_id: string | null;
  topic_id: string | null;
  is_read: boolean;
  created_at: string;
  // Joined fields
  actor?: Pick<User, "id" | "display_name"> | null;
  topic?: Pick<Topic, "id" | "title" | "slug"> | null;
}

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  citations?: RAGChunk[];
}

export interface AIConversation {
  id: string;
  topic_id: string;
  user_id: string;
  messages: AIMessage[];
  created_at: string;
  updated_at: string;
}

export interface RAGChunk {
  id: string;
  paper_id: string;
  chunk_text: string;
  chunk_index: number;
  similarity: number;
}

export interface StanceTagCount {
  tag: string;
  count: number;
}

// ===== Live Sessions (005_live_sessions.sql) =====

export type LiveSessionStatus = "lobby" | "voting" | "revealed" | "ended";

export interface LiveSession {
  id: string;
  code: string;
  topic_id: string;
  host_id: string;
  status: LiveSessionStatus;
  question: string;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  // 006_spotlight_draw.sql
  raffle_mode: boolean;
  current_spotlight_draw_id: string | null;
  spotlight_cycle: number;
}

export interface LiveSessionOption {
  id: string;
  session_id: string;
  label: string;
  source_stance_tag: string | null;
  display_order: number;
}

export interface LiveParticipant {
  session_id: string;
  user_id: string;
  display_name: string;
  joined_at: string;
  callable: boolean; // 006: opt-out of being drawn (default true)
}

export interface LiveResponse {
  session_id: string;
  user_id: string;
  option_id: string;
  note: string | null;
  round_number: number;
  created_at: string;
  updated_at: string;
}

// Shape returned by the get_live_session_by_code RPC (pre-join preview)
export interface LiveSessionPreview {
  id: string;
  status: LiveSessionStatus;
  question: string;
  topic_id: string;
  topic_title: string;
  topic_slug: string;
  is_host: boolean;
  is_participant: boolean;
}

// One row per option from the get_live_tally RPC
export interface LiveTallyRow {
  option_id: string;
  label: string;
  display_order: number;
  vote_count: number;
  participant_count: number;
}

// ===== Live Spotlight Draws (006_spotlight_draw.sql) =====

export type SpotlightMode =
  | "uniform"
  | "no_repeat"
  | "minority_weighted"
  | "minority_steelman";

export type SpotlightOutcome = "pending" | "shared" | "passed" | "cleared";

export interface LiveSpotlightDraw {
  id: string;
  session_id: string;
  cycle: number;
  sequence: number;
  mode: SpotlightMode;
  minority_option_id: string | null;
  drawn_user_id: string;
  display_name: string;
  pool_size: number;
  outcome: SpotlightOutcome;
  note_shared: boolean;
  created_at: string;
  resolved_at: string | null;
}

// Shape returned by the get_current_spotlight RPC — the read every screen
// refetches on the nudge. is_you is evaluated server-side; drawn_note is only
// populated for the drawn user, or for everyone once note_shared is true.
export interface CurrentSpotlight {
  draw_id: string;
  // NULL to non-drawn viewers when outcome is passed/cleared (silent-pass consent)
  drawn_display_name: string | null;
  mode: SpotlightMode;
  outcome: SpotlightOutcome;
  note_shared: boolean;
  is_you: boolean;
  drawn_note: string | null;
  pool_size: number;
}

// Shape returned by the draw_spotlight RPC (the host's draw result)
export interface DrawResult {
  draw_id: string;
  drawn_display_name: string;
  mode: SpotlightMode;
  sequence: number;
  pool_size: number;
}

// One row per participant from the host-only get_spotlight_history RPC
// (the no-repeat "already-called" roster).
export interface SpotlightHistoryRow {
  user_id: string;
  display_name: string;
  draw_count: number;
  last_outcome: SpotlightOutcome | null;
  last_sequence: number | null;
  participant_count: number;
}
