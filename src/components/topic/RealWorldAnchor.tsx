interface RealWorldAnchorProps {
  title: string;
  body: string;
  source_url?: string | null;
}

export default function RealWorldAnchor({ title, body, source_url }: RealWorldAnchorProps) {
  if (!title && !body) return null;

  return (
    <div className="anchor-card">
      <p className="anchor-card-label">Real-world case</p>
      <p className="anchor-card-title">{title}</p>
      <p className="anchor-card-body">{body}</p>
      {source_url && (
        <a
          href={source_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: "0.8rem", color: "var(--accent)", display: "inline-block", marginTop: "0.5rem" }}
        >
          Source →
        </a>
      )}
    </div>
  );
}
