// Section-aware text chunking for the RAG pipeline.
// Input: Docling-extracted markdown from an academic paper.
// Output: chunks of ~500 tokens with ~50-token overlap.

export interface TextChunk {
  text: string;
  chunkIndex: number;
}

// Rough token approximation: 1 token ≈ 4 characters.
// Exact counts don't matter for chunking — rough sizing is sufficient.
const CHARS_PER_TOKEN = 4;
const TARGET_TOKENS = 500;
const OVERLAP_TOKENS = 50;
const TARGET_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN;   // 2000 chars
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN; // 200 chars

/**
 * Split markdown text into RAG-ready chunks.
 * Strategy:
 *   1. Split on section headings (## and ###) to preserve document structure.
 *   2. For sections that exceed TARGET_CHARS, split further by sentence boundary.
 *   3. Add overlap between consecutive chunks by prepending the tail of the previous chunk.
 */
export function chunkText(markdown: string): TextChunk[] {
  const sections = splitBySections(markdown);
  const rawChunks: string[] = [];

  for (const section of sections) {
    if (section.trim().length === 0) continue;

    if (section.length <= TARGET_CHARS) {
      rawChunks.push(section.trim());
    } else {
      // Split oversized section by sentence boundaries
      const sentences = splitBySentences(section);
      let current = "";
      for (const sentence of sentences) {
        if ((current + sentence).length > TARGET_CHARS && current.length > 0) {
          rawChunks.push(current.trim());
          current = sentence;
        } else {
          current += sentence;
        }
      }
      if (current.trim().length > 0) rawChunks.push(current.trim());
    }
  }

  // Add overlap: prepend tail of previous chunk to each chunk
  const chunksWithOverlap: string[] = rawChunks.map((chunk, i) => {
    if (i === 0) return chunk;
    const prev = rawChunks[i - 1];
    const overlap = prev.slice(-OVERLAP_CHARS);
    return overlap + "\n\n" + chunk;
  });

  return chunksWithOverlap
    .filter((text) => text.trim().length > 0)
    .map((text, chunkIndex) => ({ text: text.trim(), chunkIndex }));
}

function splitBySections(markdown: string): string[] {
  // Split on ## or ### headings (preserve the heading in the section)
  const lines = markdown.split("\n");
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^#{2,3}\s/.test(line) && current.length > 0) {
      sections.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) sections.push(current.join("\n"));
  return sections;
}

function splitBySentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
  return text.split(/(?<=[.!?])\s+/).map((s) => s + " ");
}
