import Link from "next/link";

interface ConceptChipProps {
  term: string;
  slug: string;
}

export default function ConceptChip({ term, slug }: ConceptChipProps) {
  return (
    <Link
      href={`/concepts/${slug}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: "0.78rem",
        padding: "3px 10px",
        borderRadius: 12,
        background: "rgba(59, 110, 165, 0.07)",
        color: "var(--accent)",
        border: "1px solid rgba(59, 110, 165, 0.2)",
        textDecoration: "none",
        transition: "background-color 0.15s",
        fontWeight: 500,
      }}
    >
      {term}
    </Link>
  );
}
