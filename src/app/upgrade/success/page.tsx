import Link from "next/link";

export default function UpgradeSuccessPage() {
  return (
    <div className="page-narrow" style={{ textAlign: "center", paddingTop: "5rem" }}>
      <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>✦</div>
      <h1 style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: "0.5rem" }}>Welcome to Pro</h1>
      <p style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.65, maxWidth: 420, margin: "0 auto 2rem" }}>
        AI Q&A is now unlocked. Pass the comprehension quiz on any topic to start your conversation with the AI reasoning partner.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
        <Link href="/topics" className="btn btn-primary" style={{ textDecoration: "none" }}>
          Explore topics
        </Link>
        <Link href="/profile" className="btn" style={{ textDecoration: "none" }}>
          View profile
        </Link>
      </div>
    </div>
  );
}
