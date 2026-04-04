import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "arxiv.org" },
      { protocol: "https", hostname: "*.arxiv.org" },
      { protocol: "https", hostname: "philarchive.org" },
      { protocol: "https", hostname: "mit.edu" },
      { protocol: "https", hostname: "*.mit.edu" },
    ],
  },
};

export default nextConfig;
