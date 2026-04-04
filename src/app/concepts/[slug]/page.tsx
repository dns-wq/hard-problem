"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

export default function ConceptPage() {
  const params = useParams<{ slug: string }>();
  const { data: concept, isLoading, error } = trpc.concepts.bySlug.useQuery({ slug: params.slug });

  if (isLoading) {
    return (
      <div className="page-narrow">
        <div style={{ height: 28, background: "var(--bg-surface)", borderRadius: 4, marginBottom: "1rem", width: "40%", opacity: 0.5 }} />
      </div>
    );
  }

  if (error || !concept) {
    return (
      <div className="page-narrow" style={{ textAlign: "center", paddingTop: "4rem" }}>
        <p style={{ color: "var(--text-muted)" }}>Concept not found.</p>
        <Link href="/concepts" className="btn" style={{ marginTop: "1rem", display: "inline-block", textDecoration: "none" }}>
          ← All concepts
        </Link>
      </div>
    );
  }

  return (
    <div className="page-narrow">
      <Link href="/concepts" style={{ fontSize: "0.8rem", color: "var(--text-muted)", textDecoration: "none", display: "inline-block", marginBottom: "1.5rem" }}>
        ← Concepts
      </Link>

      <h1 style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: "1rem" }}>{concept.term}</h1>

      <section style={{ marginBottom: "1.5rem" }}>
        <p style={{ fontSize: "1rem", lineHeight: 1.7, color: "var(--text-primary)" }}>{concept.definition}</p>
      </section>

      {concept.examples && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.6rem" }}>
            Examples
          </h2>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.65, color: "var(--text-secondary)" }}>{concept.examples}</p>
        </section>
      )}

      {concept.related_terms && concept.related_terms.length > 0 && (
        <section>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.6rem" }}>
            Related terms
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {(concept.related_terms as string[]).map((term) => (
              <span key={term} className="tag">{term}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
