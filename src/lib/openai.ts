// Server-side OpenAI client for generating text embeddings
// Used only for the admin-side RAG pipeline (paper chunking + embedding)

import OpenAI from "openai";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

const EMBEDDING_MODEL = "text-embedding-3-small";

// Embed a single string. Returns a 1536-dimension vector.
export async function embedText(text: string): Promise<number[]> {
  const response = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

// Embed multiple strings in a single API call (max 100 per batch).
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length > 100) throw new Error("embedBatch: max 100 texts per call");
  const response = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}
