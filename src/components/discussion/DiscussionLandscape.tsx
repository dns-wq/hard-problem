"use client";

interface StanceCount {
  tag: string;
  count: number;
}

interface DiscussionLandscapeProps {
  stanceTags: StanceCount[];
  activeFilter: string | null;
  onFilterChange: (tag: string | null) => void;
  totalCount: number;
}

export default function DiscussionLandscape({ stanceTags, activeFilter, onFilterChange, totalCount }: DiscussionLandscapeProps) {
  if (!stanceTags.length) return null;

  const max = stanceTags[0].count;

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-light)",
      borderRadius: 8,
      padding: "1rem 1.25rem",
      marginBottom: "1.5rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.75rem" }}>
        <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
          Stance landscape
        </span>
        {activeFilter && (
          <button
            type="button"
            onClick={() => onFilterChange(null)}
            style={{ fontSize: "0.72rem", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            Clear filter ✕
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
        {stanceTags.slice(0, 8).map(({ tag, count }) => {
          const pct = Math.round((count / totalCount) * 100);
          const barWidth = (count / max) * 100;
          const isActive = activeFilter === tag;

          return (
            <button
              key={tag}
              type="button"
              onClick={() => onFilterChange(isActive ? null : tag)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "0.2rem 0",
                textAlign: "left",
                width: "100%",
              }}
            >
              <span style={{
                fontSize: "0.78rem",
                minWidth: 140,
                maxWidth: 180,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: isActive ? "var(--accent)" : "var(--text-secondary)",
                fontWeight: isActive ? 600 : 400,
              }}>
                {tag}
              </span>
              <div style={{ flex: 1, position: "relative", height: 6 }}>
                <div className="landscape-track" style={{ position: "absolute", inset: 0 }} />
                <div
                  className="landscape-bar"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${barWidth}%`,
                    background: isActive ? "var(--accent)" : "rgba(59,110,165,0.45)",
                  }}
                />
              </div>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", minWidth: 28, textAlign: "right" }}>
                {pct}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
