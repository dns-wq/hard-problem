import Link from "next/link";

const STEPS = [
  {
    n: "01",
    title: "Read a real paper",
    body: "Each topic is anchored to a focal academic paper and a counter-reading that challenges it. Open-access papers are readable inline.",
  },
  {
    n: "02",
    title: "Engage with the discussion",
    body: "Write your analysis, build on others' arguments, and react to ideas. Contributions are tagged by stance so you can see the landscape of thought.",
  },
  {
    n: "03",
    title: "Pass the quiz",
    body: "A short comprehension quiz checks you engaged with the material. Unlimited attempts — it's not a test, it's a gate.",
  },
  {
    n: "04",
    title: "Ask the AI (Pro)",
    body: "Claude, grounded exclusively in the topic's papers, helps you sharpen your arguments and explore implications — never lectures, always Socratic.",
  },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "5rem 1.5rem 3rem" }}>
        <p style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent)", marginBottom: "1rem" }}>
          Hard Problem
        </p>
        <h1 style={{ fontSize: "2.4rem", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.025em", marginBottom: "1.25rem" }}>
          Think more clearly<br />about technology ethics.
        </h1>
        <p style={{ fontSize: "1.05rem", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 520, marginBottom: "2rem" }}>
          A learning platform for STEM professionals. Engage with academic papers, structured peer discussion, and an AI grounded in the source material.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link href="/topics" className="btn btn-primary" style={{ fontSize: "0.95rem", padding: "0.6rem 1.6rem", textDecoration: "none" }}>
            Explore topics
          </Link>
          <Link href="/about" className="btn" style={{ fontSize: "0.95rem", padding: "0.6rem 1.6rem", textDecoration: "none" }}>
            How it works
          </Link>
        </div>
      </div>

      {/* How it works */}
      <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)", padding: "3rem 1.5rem" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "2rem", textAlign: "center" }}>
            How it works
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
            {STEPS.map((step) => (
              <div key={step.n}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent)", display: "block", marginBottom: "0.5rem", fontVariantNumeric: "tabular-nums" }}>
                  {step.n}
                </span>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.4rem" }}>{step.title}</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Designed for STEM */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          Built for engineers, scientists, and builders
        </h2>
        <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 560, marginBottom: "1.5rem" }}>
          Technology ethics is taught as a humanities course. Hard Problem treats it as a domain problem — rigorous, source-grounded, and collaborative. No lectures. No vague frameworks. Just the hard questions.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link href="/topics" className="btn btn-primary" style={{ textDecoration: "none" }}>
            Start for free
          </Link>
          <Link href="/upgrade" className="btn" style={{ textDecoration: "none" }}>
            See Pro features
          </Link>
        </div>
      </div>
    </div>
  );
}
