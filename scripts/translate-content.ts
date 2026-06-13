#!/usr/bin/env npx tsx
/**
 * Hard Problem — Content translation (Phase 3 i18n)
 * Run: npx tsx scripts/translate-content.ts [--all | --topic <slug>] [--locale zh-TW] [--promote] [--dry]
 *
 * Reads published topics + their quiz questions, asks Claude to translate the
 * content fields into Traditional Chinese (Taiwan) using the project glossary +
 * register, and upserts rows into public.content_translations as status='machine'
 * (a human promotes to 'reviewed' before they're served — see docs/i18n-zh-tw-plan.md).
 *
 *   --all            translate every published topic (default if no --topic)
 *   --topic <slug>   translate just one topic (+ its quiz questions)
 *   --locale <code>  target locale (default zh-TW)
 *   --promote        write status='reviewed' directly (skip human review — use only
 *                    when you trust the output and will spot-check after)
 *   --dry            print what would be written, write nothing
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) + ANTHROPIC_API_KEY. Idempotent:
 * re-running overwrites the same (entity, field) rows in place.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env.local (same manual parse as the seed scripts — no dotenv dep)
try {
  const env = readFileSync(path.join(__dirname, "../.env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([^#\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
} catch {
  /* env may already be in the environment */
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-20250514"; // matches src/lib/anthropic.ts

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY required");

// ---- args ----
const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const val = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const LOCALE = val("--locale") ?? "zh-TW";
const TOPIC_SLUG = val("--topic");
const STATUS = has("--promote") ? "reviewed" : "machine";
const DRY = has("--dry");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ---- the register + glossary (kept in sync with docs/i18n-zh-tw-plan.md) ----
const SYSTEM_PROMPT = `You translate a philosophy/tech-ethics learning platform into Traditional Chinese (Taiwan).

REGISTER & STYLE — non-negotiable:
- Traditional characters, TAIWAN usage. Never Simplified, never Mainland phrasing.
- Warm, clear, 你 register. Friendly and intellectually engaged; avoid stiff 公文腔 (officialese).
- Full-width punctuation in Chinese runs: ，。、？！；：「」『』（）. Use 「」for quotes, 破折號「——」for em-dashes (never a spaced Latin "-").
- Keep Latin technical tokens and proper nouns UNtranslated: "Hard Problem" (brand), "Claude", "AI", "QR code", "PDF", "MIT", "Pro", paper/author names, journal names, URLs.
- Preserve any {placeholder} tokens EXACTLY (same name, same braces) — they are interpolated at runtime.
- Preserve Markdown/formatting structure (## headings, **bold**, lists, blockquotes) if present.
- Translate meaning, not word-for-word. It must read as if written by a Taiwanese editor.

TAIWAN TERM MAP (use the left form): 軟體(not 软件) 程式(not 程序) 網路/線上(not 网络/在线) 資訊(not 信息) 登入(not 登录) 設定(not 设置) 帳號(not 账号) 預設(not 默认) 連結(not 链接) 影片(not 视频) 點選/點按(not 点击) 演算法(not 算法) 使用者(not 用户) 檔案(not 文件).

PHILOSOPHY GLOSSARY (Taiwan academic): the hard problem (of consciousness)=意識的困難問題; consciousness=意識; qualia=感質; mind–body problem=心物問題; trolley problem=電車難題; thought experiment=思想實驗; free will=自由意志; utilitarianism=效益主義; deontology=義務論; virtue ethics=德行倫理學; algorithmic fairness=演算法公平性; privacy=隱私; informed consent=知情同意.

OUTPUT FORMAT: You receive a JSON object mapping field keys to English source text. Return ONLY a JSON object with the SAME keys, each value the Traditional Chinese (Taiwan) translation. No commentary, no code fences — just the JSON object.`;

async function translateFields(fields: Record<string, string>): Promise<Record<string, string>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(fields, null, 2) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content?.[0]?.text;
  if (typeof text !== "string") throw new Error("unexpected Anthropic response");
  // Strip any accidental code fence, then parse.
  const json = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(json) as Record<string, string>;
}

type TransRow = { entity_type: string; entity_id: string; locale: string; field: string; value: string; status: string };

async function upsert(rows: TransRow[]) {
  if (rows.length === 0) return;
  if (DRY) {
    for (const r of rows) console.log(`   [dry] ${r.entity_type} ${r.field} → ${r.value.slice(0, 50)}${r.value.length > 50 ? "…" : ""}`);
    return;
  }
  const { error } = await supabase
    .from("content_translations")
    .upsert(rows, { onConflict: "entity_type,entity_id,locale,field" });
  if (error) throw error;
}

// Build the {field: text} job for a topic (skips empty fields).
function topicFields(t: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  if (t.title) out["title"] = String(t.title);
  if (t.framing_note) out["framing_note"] = String(t.framing_note);
  if (t.discussion_prompt) out["discussion_prompt"] = String(t.discussion_prompt);
  const anchor = t.real_world_anchor as { title?: string; body?: string } | null;
  if (anchor?.title) out["real_world_anchor.title"] = anchor.title;
  if (anchor?.body) out["real_world_anchor.body"] = anchor.body;
  return out;
}

// Build the {field: text} job for a quiz question. Option TEXT keyed by label
// (option.A …); the correct_answer LABEL is never translated.
function quizFields(q: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  if (q.question_text) out["question_text"] = String(q.question_text);
  if (q.explanation) out["explanation"] = String(q.explanation);
  const options = q.options as { label: string; text: string }[] | null;
  if (Array.isArray(options)) for (const o of options) if (o?.text) out[`option.${o.label}`] = o.text;
  return out;
}

async function translateEntity(entityType: string, id: string, fields: Record<string, string>, label: string) {
  if (Object.keys(fields).length === 0) return 0;
  const translated = await translateFields(fields);
  const rows: TransRow[] = [];
  for (const [field, source] of Object.entries(fields)) {
    const value = translated[field];
    if (typeof value === "string" && value.trim()) {
      rows.push({ entity_type: entityType, entity_id: id, locale: LOCALE, field, value, status: STATUS });
    } else {
      console.warn(`   ⚠ missing translation for ${field} (${label})`);
    }
  }
  await upsert(rows);
  console.log(`   ✓ ${label}: ${rows.length} field(s)`);
  return rows.length;
}

async function main() {
  console.log(`Translating content → ${LOCALE} (status=${STATUS}${DRY ? ", DRY RUN" : ""})\n`);

  let topicQuery = supabase.from("topics").select("*").eq("status", "published");
  if (TOPIC_SLUG) topicQuery = topicQuery.eq("slug", TOPIC_SLUG);
  const { data: topics, error } = await topicQuery;
  if (error) throw error;
  if (!topics?.length) { console.log("No matching published topics."); return; }

  let totalFields = 0;
  for (const topic of topics) {
    console.log(`▸ Topic: ${topic.title} (${topic.slug})`);
    totalFields += await translateEntity("topic", topic.id, topicFields(topic), `topic "${topic.slug}"`);

    const { data: questions } = await supabase
      .from("quiz_questions")
      .select("id, question_text, options, explanation, correct_answer")
      .eq("topic_id", topic.id)
      .order("display_order", { ascending: true });
    for (const q of questions ?? []) {
      totalFields += await translateEntity("quiz_question", q.id, quizFields(q), `quiz ${String(q.question_text).slice(0, 40)}…`);
    }
    console.log("");
  }

  console.log(`Done. ${totalFields} field(s) ${DRY ? "previewed" : `written as '${STATUS}'`} across ${topics.length} topic(s).`);
  if (!DRY && STATUS === "machine") {
    console.log(`\nReview, then promote with SQL:\n  UPDATE content_translations SET status='reviewed' WHERE locale='${LOCALE}' AND status='machine';`);
  }
}

main().catch((e) => { console.error("translate-content failed:", e); process.exit(1); });
