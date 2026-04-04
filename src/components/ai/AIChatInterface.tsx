"use client";

import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import CitationChip from "./CitationChip";

interface RAGChunk {
  id: string;
  paper_id: string;
  chunk_text: string;
  chunk_index: number;
  similarity: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  citations?: RAGChunk[];
}

// Parse [N] citation markers in assistant text into CitationChip components
function renderWithCitations(text: string, citations: RAGChunk[]): React.ReactNode {
  if (!citations.length) return text;

  const parts: React.ReactNode[] = [];
  const regex = /\[(\d+)\]/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const n = parseInt(match[1]);
    const chunk = citations[n - 1];
    if (chunk) {
      parts.push(<CitationChip key={`${match.index}`} index={n} chunkText={chunk.chunk_text} />);
    } else {
      parts.push(match[0]);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

interface AIChatInterfaceProps {
  topicId: string;
}

export default function AIChatInterface({ topicId }: AIChatInterfaceProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const getOrCreate = trpc.ai.getOrCreateConversation.useMutation();
  const sendMessage = trpc.ai.sendMessage.useMutation();

  // Initialise conversation on mount
  useEffect(() => {
    getOrCreate.mutateAsync({ topicId }).then((conv) => {
      setConversationId(conv.id);
      setMessages((conv.messages as Message[]) ?? []);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  // Scroll to bottom after messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  async function handleSend() {
    const text = input.trim();
    if (!text || !conversationId || isTyping) return;

    setInput("");
    setError("");
    setIsTyping(true);

    const userMsg: Message = { role: "user", content: text, timestamp: new Date().toISOString() };
    setMessages((m) => [...m, userMsg]);

    try {
      const result = await sendMessage.mutateAsync({
        conversationId,
        topicId,
        message: text,
      });

      const assistantMsg: Message = {
        role: "assistant",
        content: result.content,
        timestamp: new Date().toISOString(),
        citations: result.citations as RAGChunk[],
      };
      setMessages((m) => [...m, assistantMsg]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setMessages((m) => m.slice(0, -1)); // remove the optimistic user message on error
    } finally {
      setIsTyping(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const isEmpty = messages.length === 0 && !isTyping;

  return (
    <>
      {/* Messages */}
      <div className="ai-messages">
        {isEmpty && (
          <div style={{ textAlign: "center", marginTop: "auto", padding: "1rem 0" }}>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
              Ask a question about this topic's papers.<br />
              Responses are grounded in the source material.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={msg.role === "user" ? "ai-message-user" : "ai-message-assistant"}>
            <div className="ai-message-content">
              {msg.role === "assistant"
                ? renderWithCitations(msg.content, msg.citations ?? [])
                : msg.content}
            </div>
            {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.4rem", paddingLeft: "0.1rem" }}>
                {msg.citations.map((c, ci) => (
                  <CitationChip key={c.id} index={ci + 1} chunkText={c.chunk_text} />
                ))}
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="ai-message-assistant">
            <div className="ai-message-content" style={{ display: "flex", gap: "4px", alignItems: "center", padding: "0.75rem 0.9rem" }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{
                  width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)",
                  animation: "pulse 1.2s infinite",
                  animationDelay: `${i * 0.2}s`,
                  display: "inline-block",
                }} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <p style={{ fontSize: "0.78rem", color: "#c44", padding: "0.25rem 0" }}>{error}</p>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="ai-input-area">
        <textarea
          className="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 2000))}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question… (Enter to send)"
          rows={2}
          disabled={isTyping || !conversationId}
        />
        <button
          type="button"
          className="ai-send"
          onClick={handleSend}
          disabled={!input.trim() || isTyping || !conversationId}
        >
          Send
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
