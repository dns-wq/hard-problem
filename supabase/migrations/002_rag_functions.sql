-- Hard Problem: RAG Functions + Vector Index
-- Run after all paper embeddings have been inserted (post-seed)

-- hnsw index for approximate nearest neighbor search.
-- Better than ivfflat at MVP scale: handles incremental inserts, no list hyperparameter.
CREATE INDEX IF NOT EXISTS idx_paper_embeddings_hnsw
  ON paper_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Match paper chunks for a given topic by vector similarity.
-- Called from the tRPC AI router via supabase.rpc('match_paper_chunks', {...})
CREATE OR REPLACE FUNCTION match_paper_chunks(
  query_embedding vector(1536),
  topic_id_filter uuid,
  match_count     int DEFAULT 6
)
RETURNS TABLE (
  id          uuid,
  paper_id    uuid,
  chunk_text  text,
  chunk_index int,
  similarity  float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    pe.id,
    pe.paper_id,
    pe.chunk_text,
    pe.chunk_index,
    1 - (pe.embedding <=> query_embedding) AS similarity
  FROM paper_embeddings pe
  JOIN papers p ON pe.paper_id = p.id
  WHERE p.topic_id = topic_id_filter
  ORDER BY pe.embedding <=> query_embedding
  LIMIT match_count;
$$;
