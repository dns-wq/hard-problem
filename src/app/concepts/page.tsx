"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

export default function ConceptsPage() {
  const { data: concepts, isLoading } = trpc.concepts.list.useQuery();
  const [search, setSearch] = useState("");

  const filtered = (concepts ?? []).filter((c) =>
    !search || c.term.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.4rem" }}>Concepts</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Key terms from tech ethics, philosophy, and AI safety.
        </p>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search concepts…"
        style={{
          fontSize: "0.875rem",
          padding: "0.5rem 0.75rem",
          border: "1px solid var(--border)",
          borderRadius: 6,
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          outline: "none",
          width: "100%",
          maxWidth: 360,
          marginBottom: "1.5rem",
          display: "block",
        }}
      />

      {isLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : !filtered.length ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
          {search ? "No concepts match your search." : "No concepts yet."}
        </p>
      ) : (
        <div style={{ columns: "2 300px", gap: "0.75rem" }}>
          {filtered.map((concept) => (
            <div key={concept.id} style={{ breakInside: "avoid", marginBottom: "0.75rem" }}>
              <Link
                href={`/concepts/${concept.slug}`}
                style={{
                  display: "block",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-light)",
                  borderRadius: 8,
                  padding: "1rem 1.25rem",
                  textDecoration: "none",
                  transition: "border-color 0.15s",
                }}
              >
                <h2 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.3rem" }}>
                  {concept.term}
                </h2>
                <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {concept.definition}
                </p>
                {concept.related_terms && concept.related_terms.length > 0 && (
                  <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                    Related: {concept.related_terms.slice(0, 3).join(", ")}
                  </p>
                )}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
