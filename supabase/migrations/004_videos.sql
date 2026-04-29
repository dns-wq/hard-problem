-- Hard Problem: Add videos column to topics
-- Run in Supabase SQL Editor

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS videos JSONB NOT NULL DEFAULT '[]';

-- Expected shape per entry:
-- {
--   "youtube_id": "uhRhtFFhNzQ",
--   "title": "How do you explain consciousness?",
--   "speaker": "David Chalmers",
--   "duration_min": 18,
--   "note": "The author explains the hard problem in his own words."
-- }
