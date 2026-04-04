export default function AboutPage() {
  return (
    <div className="page-narrow">
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>About Hard Problem</h1>
      <div className="framing-note">
        <p>Hard Problem is an open-source learning platform where STEM professionals develop philosophical thinking skills through structured engagement with real academic papers on technology ethics.</p>
        <p>It is not a philosophy course delivered to STEM people. It is a STEM-native experience — using humanities tools, grounded in authoritative sources, and structured around peer collaboration.</p>
        <p>Each topic unit centers on a focal paper, a counter-reading that disagrees, a real-world anchor, and a structured discussion space. An AI Reasoning Partner (for subscribers) is grounded in the source material and helps you refine your own arguments rather than doing your thinking for you.</p>
        <p>Built by <a href="https://philpapers.club" style={{ color: "var(--accent)" }}>Camus Technology</a>. Open source under AGPL-3.0.</p>
      </div>
    </div>
  );
}
