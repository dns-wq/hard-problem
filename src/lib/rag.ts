// RAG retrieval: finds the most relevant paper chunks for a given query.
// Uses the match_paper_chunks Supabase RPC function (pgvector cosine similarity).

import { embedText } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import type { RAGChunk } from "@/types/database";

/**
 * Retrieve the top-k most relevant paper chunks for a query within a topic.
 * Called from the AI router during sendMessage.
 */
export async function retrieveRelevantChunks(
  query: string,
  topicId: string,
  k = 6,
): Promise<RAGChunk[]> {
  const [queryEmbedding, supabase] = await Promise.all([
    embedText(query),
    createClient(),
  ]);

  const { data, error } = await supabase.rpc("match_paper_chunks", {
    query_embedding: queryEmbedding,
    topic_id_filter: topicId,
    match_count: k,
  });

  if (error) throw new Error(`RAG retrieval error: ${error.message}`);
  return (data ?? []) as RAGChunk[];
}
