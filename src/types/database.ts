// Hard Problem — Database Types
// Mirrors the schema in supabase/migrations/001_initial_schema.sql

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
