-- Hard Problem: Initial Schema
-- Run against your Supabase project SQL editor

-- ===== Extensions =====

CREATE EXTENSION IF NOT EXISTS vector;

-- ===== Users =====

CREATE TABLE users (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                           TEXT UNIQUE NOT NULL,
  display_name                    TEXT NOT NULL,
  bio                             TEXT,
  role                            TEXT CHECK (role IN ('user', 'editor', 'admin')) DEFAULT 'user',
  stripe_customer_id              TEXT UNIQUE,
  stripe_subscription_id          TEXT,
  subscription_status             TEXT CHECK (subscription_status IN
                                    ('active', 'trialing', 'past_due', 'canceled', 'none'))
                                    DEFAULT 'none',
  subscription_tier               TEXT CHECK (subscription_tier IN ('free', 'pro')) DEFAULT 'free',
  subscription_current_period_end TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ DEFAULT now(),
  updated_at                      TIMESTAMPTZ DEFAULT now()
);

-- ===== Topics =====

CREATE TABLE topics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  status            TEXT CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',

  -- Editorial content
  framing_note      TEXT NOT NULL DEFAULT '',
  discussion_prompt TEXT NOT NULL DEFAULT '',
  real_world_anchor JSONB NOT NULL DEFAULT '{}', -- { title, body, source_url?, date? }

  -- Metadata
  concepts          TEXT[],
  difficulty        TEXT CHECK (difficulty IN ('accessible', 'intermediate', 'advanced'))
                    DEFAULT 'intermediate',
  domains           TEXT[], -- ['ai_safety', 'privacy', 'algorithmic_fairness', ...]

  sequence_number   INTEGER,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ===== Papers =====

CREATE TABLE papers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id             UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  role                 TEXT CHECK (role IN ('focal', 'counter', 'supplementary')) NOT NULL,

  title                TEXT NOT NULL,
  authors              TEXT NOT NULL,
  year                 INTEGER,
  source_url           TEXT NOT NULL,       -- canonical URL (arXiv, publisher, etc.)
  pdf_url              TEXT,                -- direct PDF URL (open access only)
  abstract             TEXT,
  is_open_access       BOOLEAN DEFAULT FALSE,

  -- Docling-extracted text for RAG pipeline only (never displayed to users)
  full_extracted_text  TEXT,

  display_order        INTEGER DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- ===== Concepts (philosophical glossary) =====

CREATE TABLE concepts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term          TEXT UNIQUE NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  definition    TEXT NOT NULL,
  examples      TEXT,
  related_terms TEXT[],
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE topic_concepts (
  topic_id   UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  PRIMARY KEY (topic_id, concept_id)
);

-- ===== Contributions =====
-- Three types, enforced by constraint:
--   Top-level:  parent_id NULL,  relationship_type NULL,         body TEXT,    reaction_type NULL
--   Build on:   parent_id SET,   relationship_type 'build_on',   body TEXT,    reaction_type NULL
--   Reply:      parent_id SET,   relationship_type 'reply',      body NULL,    reaction_type SET

CREATE TABLE contributions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id          UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id         UUID REFERENCES contributions(id),
  relationship_type TEXT CHECK (relationship_type IN ('build_on', 'reply')),
  body              TEXT,
  reaction_type     TEXT CHECK (reaction_type IN ('great_point', 'interesting', 'i_disagree', 'thumbs_up')),
  stance_tag        TEXT,   -- user-generated; only meaningful on top-level contributions

  -- Moderation
  is_flagged        BOOLEAN DEFAULT FALSE,
  is_removed        BOOLEAN DEFAULT FALSE,

  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT body_or_reaction CHECK (
    (relationship_type = 'reply'  AND reaction_type IS NOT NULL AND body IS NULL)
    OR (relationship_type != 'reply' AND body IS NOT NULL AND reaction_type IS NULL)
    OR (relationship_type IS NULL   AND body IS NOT NULL AND reaction_type IS NULL)
  )
);

-- ===== User Progress =====

CREATE TABLE user_progress (
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id           UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,

  paper_opened       BOOLEAN DEFAULT FALSE,
  counter_opened     BOOLEAN DEFAULT FALSE,
  quiz_passed        BOOLEAN DEFAULT FALSE,  -- gate for AI Reasoning Partner
  time_spent_sec     INTEGER DEFAULT 0,
  contributed        BOOLEAN DEFAULT FALSE,
  contribution_count INTEGER DEFAULT 0,
  built_upon_count   INTEGER DEFAULT 0,       -- times others used 'build_on' on this user's contributions

  first_visited      TIMESTAMPTZ DEFAULT now(),
  last_visited       TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, topic_id)
);

-- ===== Comprehension Quiz Questions =====
-- 1–2 fact-based MCQ or T/F questions per topic.
-- Gate for AI Reasoning Partner. Unlimited attempts.

CREATE TABLE quiz_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id      UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT CHECK (question_type IN ('mcq', 'true_false')) NOT NULL,
  options       JSONB,         -- MCQ: [{ label: 'A', text: '...' }]; NULL for true_false
  correct_answer TEXT NOT NULL, -- option label ('A'/'B'/...) or 'true'/'false'
  explanation   TEXT,           -- shown after each attempt regardless of correctness
  display_order INTEGER DEFAULT 0
);

-- ===== In-App Notifications =====

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT CHECK (type IN ('build_on', 'reply', 'moderation')) NOT NULL,
  actor_id        UUID REFERENCES users(id),
  contribution_id UUID REFERENCES contributions(id) ON DELETE SET NULL,
  topic_id        UUID REFERENCES topics(id) ON DELETE SET NULL,
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ===== AI Conversations =====
-- Requires: subscription_tier = 'pro' AND user_progress.quiz_passed = TRUE for this topic

CREATE TABLE ai_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id   UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  messages   JSONB NOT NULL DEFAULT '[]', -- [{ role, content, timestamp, citations? }]
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===== AI Usage (rate limiting) =====

CREATE TABLE ai_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_count INT NOT NULL DEFAULT 0,
  period_start  DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (user_id, period_start)
);

-- ===== Paper Embeddings (RAG) =====

CREATE TABLE paper_embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id    UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  chunk_text  TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding   vector(1536) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ===== Indexes =====

-- Contributions
CREATE INDEX idx_contributions_topic    ON contributions(topic_id);
CREATE INDEX idx_contributions_user     ON contributions(user_id);
CREATE INDEX idx_contributions_parent   ON contributions(parent_id);
CREATE INDEX idx_contributions_created  ON contributions(created_at DESC);

-- Papers
CREATE INDEX idx_papers_topic ON papers(topic_id);

-- Progress
CREATE INDEX idx_user_progress_user  ON user_progress(user_id);
CREATE INDEX idx_user_progress_topic ON user_progress(topic_id);

-- AI
CREATE INDEX idx_ai_conversations_user_topic ON ai_conversations(user_id, topic_id);
CREATE INDEX idx_ai_usage_user_period        ON ai_usage(user_id, period_start);

-- Notifications
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- Quiz
CREATE INDEX idx_quiz_questions_topic ON quiz_questions(topic_id, display_order);

-- Concepts
CREATE INDEX idx_topic_concepts_topic   ON topic_concepts(topic_id);
CREATE INDEX idx_topic_concepts_concept ON topic_concepts(concept_id);

-- Full-text search
CREATE INDEX idx_contributions_fts ON contributions
  USING GIN (to_tsvector('english', COALESCE(body, '')));
CREATE INDEX idx_topics_fts ON topics
  USING GIN (to_tsvector('english', title || ' ' || framing_note));

-- ===== Row-Level Security =====

ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE papers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE concepts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_concepts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress   ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage        ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_embeddings ENABLE ROW LEVEL SECURITY;

-- Users
CREATE POLICY "Public user profiles" ON users FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON users FOR UPDATE USING (id = auth.uid());

-- Topics: published visible to all; editors/admins can see drafts + modify
CREATE POLICY "Published topics visible to all" ON topics
  FOR SELECT USING (
    status = 'published'
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('editor', 'admin'))
  );
CREATE POLICY "Editors modify topics" ON topics
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('editor', 'admin'))
  );

-- Papers: visible if topic is visible
CREATE POLICY "Papers visible with topic" ON papers
  FOR SELECT USING (
    topic_id IN (
      SELECT id FROM topics WHERE status = 'published'
      UNION
      SELECT id FROM topics
      WHERE auth.uid() IN (SELECT id FROM users WHERE role IN ('editor', 'admin'))
    )
  );
CREATE POLICY "Editors modify papers" ON papers
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('editor', 'admin'))
  );

-- Concepts: public read, editor write
CREATE POLICY "Concepts public read" ON concepts FOR SELECT USING (true);
CREATE POLICY "Editors modify concepts" ON concepts
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('editor', 'admin'))
  );

CREATE POLICY "Topic concepts public read" ON topic_concepts FOR SELECT USING (true);
CREATE POLICY "Editors modify topic concepts" ON topic_concepts
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('editor', 'admin'))
  );

-- Contributions: visible if not removed; own contributions modifiable
CREATE POLICY "Contributions publicly visible" ON contributions
  FOR SELECT USING (is_removed = FALSE);
CREATE POLICY "Users create contributions" ON contributions
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own contributions" ON contributions
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users delete own contributions" ON contributions
  FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "Editors moderate contributions" ON contributions
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('editor', 'admin'))
  );

-- User progress: own only
CREATE POLICY "Own progress" ON user_progress
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users manage own progress" ON user_progress
  FOR ALL USING (user_id = auth.uid());

-- Quiz questions: public read (questions must be readable to display them)
CREATE POLICY "Quiz questions public read" ON quiz_questions FOR SELECT USING (true);
CREATE POLICY "Editors modify quiz questions" ON quiz_questions
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('editor', 'admin'))
  );

-- Notifications: own only
CREATE POLICY "Own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- AI conversations: own only
CREATE POLICY "Own ai conversations" ON ai_conversations
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users create ai conversations" ON ai_conversations
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own ai conversations" ON ai_conversations
  FOR UPDATE USING (user_id = auth.uid());

-- AI usage: own only
CREATE POLICY "Own ai usage" ON ai_usage
  FOR SELECT USING (user_id = auth.uid());

-- Paper embeddings: readable by authenticated users (needed for RAG via RPC)
CREATE POLICY "Embeddings readable by authenticated users" ON paper_embeddings
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Editors manage embeddings" ON paper_embeddings
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('editor', 'admin'))
  );

-- ===== Trigger: auto-create user profile on auth signup =====

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
