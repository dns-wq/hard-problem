import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "https://www.hardproblem.club";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Supabase production credentials are required");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const createdUsers = [];
let sessionId = null;
let browser;
const stamp = Date.now();

async function createUser(label) {
  const email = `codex-browser-${label}-${stamp}@example.com`;
  const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: `Browser ${label}` } });
  if (created.error) throw created.error;
  createdUsers.push(created.data.user.id);
  const apiLink = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (apiLink.error) throw apiLink.error;
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const verified = await client.auth.verifyOtp({ type: "magiclink", token_hash: apiLink.data.properties.hashed_token });
  if (verified.error) throw verified.error;
  return { id: created.data.user.id, email, client };
}

async function signInPage(page, email, redirect) {
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${baseUrl}/auth/callback?redirect=${encodeURIComponent(redirect)}` },
  });
  if (link.error) throw link.error;
  await page.goto(link.data.properties.action_link, { waitUntil: "domcontentloaded" });
  await page.waitForURL((target) => target.origin === new URL(baseUrl).origin, { timeout: 30_000 });
  await page.goto(`${baseUrl}${redirect}`, { waitUntil: "domcontentloaded" });
}

async function rpc(client, name, args) {
  const result = await client.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  return result.data;
}

try {
  const host = await createUser("host");
  const participant = await createUser("participant");
  const topic = await admin.from("topics").select("id,discussion_prompt").eq("status", "published").limit(1).single();
  if (topic.error) throw topic.error;
  const comparison = randomUUID();
  const blocks = [
    { kind: "text", title: "Source context", content: { body: "Browser acceptance context", source_url: "https://example.com/source" }, source_type: "custom" },
    { kind: "scale", title: "Before", prompt: "Rate before", config: { min: 1, max: 5, audience_results: "on_reveal" }, comparison_group_id: comparison },
    { kind: "scale", title: "After", prompt: "Rate after", config: { min: 1, max: 5, audience_results: "on_reveal" }, comparison_group_id: comparison },
    { kind: "quiz", title: "Check", prompt: "Is this a production smoke?", config: { question_type: "true_false", correct_answer: "true", explanation: "This is the expected answer.", leaderboard: true, answer_window_sec: 60, audience_results: "on_reveal" } },
    { kind: "choice", title: "Upcoming", prompt: "Choose", config: { options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], max_selections: 1, audience_results: "never" } },
  ];
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from({ length: 6 }, (_, i) => alphabet[(stamp + i * 19) % alphabet.length]).join("");
  const created = await rpc(host.client, "create_live_rundown_session", {
    p_code: code, p_topic_id: topic.data.id, p_question: topic.data.discussion_prompt ?? "", p_blocks: blocks,
    p_starts_at: null, p_published: false,
  });
  sessionId = created[0].session_id;
  await rpc(participant.client, "join_live_session", { p_session_id: sessionId });
  const rundown = await rpc(host.client, "get_live_rundown", { p_session_id: sessionId });

  browser = await chromium.launch({ headless: true });
  const hostPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const participantPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await signInPage(hostPage, host.email, `/live/host/${code}`);
  await signInPage(participantPage, participant.email, `/live/play/${code}`);

  const activate = (index) => rpc(host.client, "activate_live_block_v2", { p_session_id: sessionId, p_block_id: rundown.blocks[index].id, p_rerun: false, p_request_id: randomUUID() });
  const textRun = await activate(0);
  await participantPage.getByText("Browser acceptance context").waitFor({ timeout: 15_000 });
  const source = participantPage.getByRole("link", { name: /open source/i });
  if (await source.getAttribute("href") !== "https://example.com/source") throw new Error("participant source link missing or unsafe");
  await rpc(host.client, "close_live_block", { p_session_id: sessionId, p_run_id: textRun });

  const beforeRun = await activate(1);
  await rpc(participant.client, "submit_live_block_response", { p_run_id: beforeRun, p_answer: { value: 2 }, p_text: null, p_share_scope: "private" });
  await rpc(host.client, "reveal_live_block", { p_session_id: sessionId, p_run_id: beforeRun });
  const afterRun = await activate(2);
  await rpc(participant.client, "submit_live_block_response", { p_run_id: afterRun, p_answer: { value: 4 }, p_text: null, p_share_scope: "private" });
  await rpc(host.client, "reveal_live_block", { p_session_id: sessionId, p_run_id: afterRun });
  await participantPage.getByText(/1 response/i).waitFor({ timeout: 15_000 });
  await participantPage.getByText(/Median:/i).waitFor();
  await participantPage.getByText(/→/).first().waitFor();

  const quizRun = await activate(3);
  await rpc(participant.client, "submit_live_block_response", { p_run_id: quizRun, p_answer: { answer: "true" }, p_text: null, p_share_scope: "private" });
  await rpc(host.client, "reveal_live_block", { p_session_id: sessionId, p_run_id: quizRun });
  await participantPage.getByText("Leaderboard").waitFor({ timeout: 15_000 });
  await participantPage.getByText("Browser participant").waitFor();

  await hostPage.getByRole("button", { name: /edit upcoming/i }).click();
  await hostPage.getByRole("button", { name: /drag to reorder block/i }).waitFor();
  await hostPage.getByRole("button", { name: /follow-up/i }).waitFor();
  console.log(JSON.stringify({ ok: true, browser: "chromium", ordinary_user_v2_creation: true, source_link: true, comparison: true, leaderboard: true, live_editor: true }));
} finally {
  if (browser) await browser.close();
  if (sessionId) await admin.from("live_sessions").delete().eq("id", sessionId);
  for (const id of createdUsers.reverse()) await admin.auth.admin.deleteUser(id);
}
