#!/usr/bin/env npx tsx
/**
 * Hard Problem — Seed Videos
 * Run: npx tsx scripts/seed-videos.ts
 *
 * Adds YouTube video data to topics.
 * Requires migration 004_videos.sql to have been run first.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  const env = readFileSync(path.join(__dirname, "../.env.local"), "utf8");
  for (const line of env.split("\n")) {
    const match = line.match(/^([^#\s][^=]*)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
} catch { /* rely on process.env */ }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const VIDEOS: Record<string, Array<{
  youtube_id: string;
  title: string;
  speaker: string;
  duration_min?: number;
  note?: string;
}>> = {
  "hard-problem-of-consciousness": [
    {
      youtube_id: "uhRhtFFhNzQ",
      title: "How do you explain consciousness?",
      speaker: "David Chalmers · TEDGlobal 2014",
      duration_min: 18,
      note: "Chalmers introduces the hard problem in his own words — why physical explanations of the brain leave the felt quality of experience untouched.",
    },
  ],
  "algorithmic-fairness": [
    {
      youtube_id: "UG_X_7g63rY",
      title: "How I'm fighting bias in algorithms",
      speaker: "Joy Buolamwini · TEDWomen 2016",
      duration_min: 9,
      note: "Buolamwini walks through the Gender Shades findings: how she discovered commercial AI systems failed to recognize her face, and why that failure isn't accidental.",
    },
  ],
};

async function seedVideos() {
  console.log("Seeding videos…\n");

  for (const [slug, videos] of Object.entries(VIDEOS)) {
    const { error } = await supabase
      .from("topics")
      .update({ videos })
      .eq("slug", slug);

    if (error) {
      console.error(`✗ ${slug}: ${error.message}`);
    } else {
      console.log(`✓ ${slug}: ${videos.length} video(s) added`);
      videos.forEach((v) => console.log(`    ↳ "${v.title}" [${v.youtube_id}]`));
    }
  }

  console.log("\nDone.");
}

seedVideos().catch((e) => { console.error(e); process.exit(1); });
