"use client";

import { useState } from "react";

interface TopicVideo {
  youtube_id: string;
  title: string;
  speaker: string;
  duration_min?: number;
  note?: string;
}

interface VideosSectionProps {
  videos: TopicVideo[];
}

function VideoEmbed({ video, isActive, onActivate }: {
  video: TopicVideo;
  isActive: boolean;
  onActivate: () => void;
}) {
  return (
    <div style={{
      border: "1px solid var(--border)",
      borderRadius: 8,
      overflow: "hidden",
      background: "var(--bg-surface)",
    }}>
      {/* Embed or thumbnail */}
      {isActive ? (
        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
          <iframe
            src={`https://www.youtube.com/embed/${video.youtube_id}?autoplay=1&rel=0`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{
              position: "absolute",
              top: 0, left: 0,
              width: "100%", height: "100%",
              border: "none",
            }}
          />
        </div>
      ) : (
        <button
          onClick={onActivate}
          style={{
            display: "block",
            width: "100%",
            padding: 0,
            border: "none",
            background: "none",
            cursor: "pointer",
            position: "relative",
          }}
          aria-label={`Play: ${video.title}`}
        >
          {/* YouTube thumbnail */}
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, background: "#000" }}>
            <img
              src={`https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`}
              alt={video.title}
              style={{
                position: "absolute",
                top: 0, left: 0,
                width: "100%", height: "100%",
                objectFit: "cover",
                opacity: 0.85,
              }}
            />
            {/* Play button overlay */}
            <div style={{
              position: "absolute",
              top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              width: 56, height: 56,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.75)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            {/* Duration badge */}
            {video.duration_min && (
              <span style={{
                position: "absolute",
                bottom: 8, right: 8,
                background: "rgba(0,0,0,0.8)",
                color: "#fff",
                fontSize: "0.7rem",
                padding: "2px 6px",
                borderRadius: 3,
              }}>
                {video.duration_min} min
              </span>
            )}
          </div>
        </button>
      )}

      {/* Metadata */}
      <div style={{ padding: "0.75rem 1rem" }}>
        <p style={{ fontWeight: 600, fontSize: "0.875rem", margin: 0, marginBottom: "0.15rem", lineHeight: 1.4 }}>
          {video.title}
        </p>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
          {video.speaker}
        </p>
        {video.note && (
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: 0, marginTop: "0.4rem", lineHeight: 1.5 }}>
            {video.note}
          </p>
        )}
      </div>
    </div>
  );
}

export default function VideosSection({ videos }: VideosSectionProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  if (!videos || videos.length === 0) return null;

  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2 style={{
        fontSize: "0.75rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "var(--text-muted)",
        marginBottom: "0.875rem",
      }}>
        From the author{videos.length > 1 ? "s" : ""}
      </h2>

      <div style={{
        display: "grid",
        gridTemplateColumns: videos.length > 1 ? "repeat(auto-fill, minmax(280px, 1fr))" : "1fr",
        gap: "1rem",
        maxWidth: videos.length === 1 ? 520 : undefined,
      }}>
        {videos.map((v) => (
          <VideoEmbed
            key={v.youtube_id}
            video={v}
            isActive={activeId === v.youtube_id}
            onActivate={() => setActiveId(v.youtube_id)}
          />
        ))}
      </div>
    </section>
  );
}
