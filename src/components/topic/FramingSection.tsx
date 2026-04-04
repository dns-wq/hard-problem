interface FramingSectionProps {
  text: string;
}

// Minimal markdown renderer for admin-authored framing notes.
// Supports: headings, bold, italic, blockquotes, paragraphs.
function renderMarkdown(text: string): React.ReactNode[] {
  const blocks = text.split(/\n\n+/);

  return blocks.map((block, bi) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

    // Heading
    const h2 = trimmed.match(/^##\s+(.+)/);
    if (h2) return <h3 key={bi} style={{ fontSize: "1rem", fontWeight: 700, marginTop: "1.5em", marginBottom: "0.5em", color: "var(--text-primary)", fontFamily: "inherit" }}>{h2[1]}</h3>;

    const h1 = trimmed.match(/^#\s+(.+)/);
    if (h1) return <h2 key={bi} style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "1.5em", marginBottom: "0.5em", color: "var(--text-primary)", fontFamily: "inherit" }}>{h1[1]}</h2>;

    // Blockquote
    if (trimmed.startsWith("> ")) {
      const inner = trimmed.replace(/^>\s?/gm, "");
      return (
        <blockquote key={bi} style={{ borderLeft: "3px solid var(--accent)", paddingLeft: "1em", margin: "1.2em 0", color: "var(--text-secondary)", fontStyle: "italic" }}>
          {inlineFormat(inner)}
        </blockquote>
      );
    }

    // Normal paragraph
    const lines = trimmed.split("\n").filter(Boolean);
    return (
      <p key={bi} style={{ marginBottom: "1.2em" }}>
        {lines.map((line, li) => (
          <span key={li}>{inlineFormat(line)}{li < lines.length - 1 ? <br /> : null}</span>
        ))}
      </p>
    );
  }).filter(Boolean) as React.ReactNode[];
}

function inlineFormat(text: string): React.ReactNode {
  // Handle **bold** and *italic*
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let last = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[0].startsWith("**")) {
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else {
      parts.push(<em key={match.index}>{match[3]}</em>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : parts;
}

export default function FramingSection({ text }: FramingSectionProps) {
  if (!text) return null;

  return (
    <div className="framing-note">
      {renderMarkdown(text)}
    </div>
  );
}
