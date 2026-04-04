-- Hard Problem: Helper Functions
-- Run after 001_initial_schema.sql

-- Atomically increments contribution_count and sets contributed = TRUE on user_progress.
-- Called from the tRPC contributions.create mutation after a top-level or build_on contribution.
CREATE OR REPLACE FUNCTION increment_contribution_count(
  p_user_id  uuid,
  p_topic_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_progress (user_id, topic_id, contributed, contribution_count, last_visited)
  VALUES (p_user_id, p_topic_id, TRUE, 1, now())
  ON CONFLICT (user_id, topic_id) DO UPDATE
    SET contributed        = TRUE,
        contribution_count = user_progress.contribution_count + 1,
        last_visited       = now();
END;
$$;

-- Atomically increments built_upon_count for the author of a parent contribution.
-- Called from tRPC contributions.create when relationship_type = 'build_on'.
CREATE OR REPLACE FUNCTION increment_built_upon_count(
  p_user_id  uuid,
  p_topic_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_progress (user_id, topic_id, built_upon_count)
  VALUES (p_user_id, p_topic_id, 1)
  ON CONFLICT (user_id, topic_id) DO UPDATE
    SET built_upon_count = user_progress.built_upon_count + 1;
END;
$$;
