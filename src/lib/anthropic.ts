// Server-side Anthropic API client (raw fetch — no SDK dependency in bundle)
// Model: claude-sonnet-4-20250514

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function callClaude(
  systemPrompt: string,
  messages: Message[],
  maxTokens = 1024,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const block = data.content?.[0];
  if (block?.type !== "text") throw new Error("Unexpected Anthropic response format");
  return block.text as string;
}
