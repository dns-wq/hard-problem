-- Hard Problem: Content translations (Phase 3 i18n — translate DB content)
-- Run after 010_guest_join.sql in the Supabase SQL editor.
-- Spec: docs/i18n-zh-tw-plan.md (Layer 2).
--
-- Design — ADDITIVE OVERLAY. One polymorphic sidecar table; existing content tables
-- are untouched. Reads overlay translated fields onto the base row for the active
-- locale and FALL BACK to the base (English) value when a translation is missing, so
-- partial translation always renders cleanly. Only status='reviewed' rows are ever
-- served publicly; the translation script writes 'machine' drafts (service role) for
-- a human to promote. entity_id is a bare UUID (no FK) so one table covers every
-- content type — topics, quiz_questions, papers, concepts.

CREATE TABLE public.content_translations (
  entity_type  TEXT NOT NULL,                 -- 'topic' | 'quiz_question' | 'paper' | 'concept'
  entity_id    UUID NOT NULL,
  locale       TEXT NOT NULL,                 -- e.g. 'zh-TW'
  field        TEXT NOT NULL,                 -- 'title' | 'question_text' | 'real_world_anchor.body' | 'option.A' | ...
  value        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'machine' CHECK (status IN ('machine', 'reviewed')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id, locale, field)
);

-- Overlay lookup is by (entity_type, entity_id[], locale, status); the PK's
-- (entity_type, entity_id) prefix already serves the IN-list. This index serves the
-- review queue (all machine rows for a locale) and bulk writes by the script.
CREATE INDEX idx_content_translations_review
  ON public.content_translations (locale, status, entity_type);

ALTER TABLE public.content_translations ENABLE ROW LEVEL SECURITY;

-- Public (anon + authenticated) may read ONLY reviewed translations — content is
-- public, but machine drafts must never reach a reader. Writes have NO policy, so
-- they are denied for anon/authenticated; the translation script and the admin
-- review UI write via the service-role key (which bypasses RLS).
CREATE POLICY "Public reads reviewed translations"
  ON public.content_translations FOR SELECT
  USING (status = 'reviewed');

GRANT SELECT ON public.content_translations TO anon, authenticated;
