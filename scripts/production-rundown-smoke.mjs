import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Supabase production credentials are required");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const createdUsers = [];
let sessionId = null;
const stamp = Date.now();
const password = `Release!${stamp}Aa`;

async function createTestUser(label, role = "user") {
  const email = `codex-${label}-${stamp}@example.com`;
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `Release ${label}` } });
  if (result.error) throw result.error;
  createdUsers.push(result.data.user.id);
  if (role !== "user") {
    const { error } = await admin.from("users").update({ role }).eq("id", result.data.user.id);
    if (error) throw error;
  }
  // Admin-generated magic-link tokens let the smoke harness authenticate
  // without weakening the production CAPTCHA policy or sending email.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  if (signIn.error) throw signIn.error;
  return { id: result.data.user.id, client };
}

async function rpc(client, name, args) {
  console.log(`step:${name}:start`);
  const result = await client.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  console.log(`step:${name}:ok`);
  return result.data;
}

async function cleanupStaleTests() {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  const stale = listed.data.users.filter((user) => user.email?.startsWith("codex-host-") || user.email?.startsWith("codex-participant-"));
  if (!stale.length) return;
  await admin.from("live_sessions").delete().in("host_id", stale.map((user) => user.id));
  for (const user of stale) await admin.auth.admin.deleteUser(user.id);
}

try {
  await cleanupStaleTests();
  // An ordinary host proves that the production rollout guard is set to `all`.
  const host = await createTestUser("host");
  const participant = await createTestUser("participant");
  const topic = await admin.from("topics").select("id,discussion_prompt").eq("status", "published").limit(1).single();
  if (topic.error) throw topic.error;
  const comparison = randomUUID();
  const blocks = [
    { kind: "text", title: "Context", content: { body: "Production acceptance context", source_url: "https://example.com/source" } },
    { kind: "choice", title: "Before", prompt: "Choose a position", config: { options: [{ id: "a", label: "Agree" }, { id: "b", label: "Disagree" }], max_selections: 1, allow_note: true, audience_results: "on_reveal" }, comparison_group_id: comparison },
    { kind: "open_text", title: "Notes", prompt: "Explain your choice", config: { max_length: 500, audience_results: "on_reveal" } },
    { kind: "video", title: "Lesson video", content: { youtube_id: "dQw4w9WgXcQ", context: "Watch on the host screen" } },
    { kind: "open_text", title: "Reflection", prompt: "What changed?", config: { max_length: 500, audience_results: "on_reveal" } },
    { kind: "word_cloud", title: "Key terms", prompt: "Add key terms", config: { max_entries: 3, max_entry_length: 40, audience_results: "on_reveal" } },
    { kind: "choice", title: "After", prompt: "Choose again", config: { options: [{ id: "a", label: "Agree" }, { id: "b", label: "Disagree" }], max_selections: 1, allow_note: true, audience_results: "on_reveal" }, comparison_group_id: comparison },
  ];
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from({ length: 6 }, (_, i) => alphabet[(stamp + i * 17) % alphabet.length]).join("");
  const created = await rpc(host.client, "create_live_rundown_session", {
    p_code: code, p_topic_id: topic.data.id, p_question: topic.data.discussion_prompt ?? "", p_blocks: blocks,
    p_starts_at: null, p_published: false,
  });
  sessionId = created[0].session_id;
  await rpc(participant.client, "join_live_session", { p_session_id: sessionId });
  const rundown = await rpc(host.client, "get_live_rundown", { p_session_id: sessionId });

  async function activate(index) {
    return rpc(host.client, "activate_live_block_v2", { p_session_id: sessionId, p_block_id: rundown.blocks[index].id, p_rerun: false, p_request_id: randomUUID() });
  }
  const textRun = await activate(0);
  const textProjection = await rpc(participant.client, "get_current_live_block", { p_session_id: sessionId });
  if (textProjection.snapshot.content.source_url !== "https://example.com/source") throw new Error("text source link missing from participant projection");
  await rpc(host.client, "close_live_block", { p_session_id: sessionId, p_run_id: textRun });
  const beforeRun = await activate(1);
  const privateResponse = await rpc(participant.client, "submit_live_block_response", { p_run_id: beforeRun, p_answer: { selections: ["a"] }, p_text: "private note", p_share_scope: "private" });
  const ownResponse = await rpc(participant.client, "get_my_live_block_response", { p_run_id: beforeRun });
  if (ownResponse.id !== privateResponse || ownResponse.text_response !== "private note") throw new Error("caller-owned response projection is incorrect");
  const privateCandidates = await rpc(host.client, "get_live_share_candidates", { p_run_id: beforeRun });
  if (privateCandidates.length !== 0) throw new Error("private response leaked to host candidates");
  await rpc(participant.client, "set_live_response_share_scope", { p_response_id: privateResponse, p_share_scope: "anonymous" });
  await rpc(host.client, "publish_live_response", { p_response_id: privateResponse, p_display_order: 0 });
  await rpc(participant.client, "set_live_response_share_scope", { p_response_id: privateResponse, p_share_scope: "private" });
  const afterWithdrawal = await rpc(host.client, "get_current_live_block", { p_session_id: sessionId });
  if (afterWithdrawal.publications.length !== 0) throw new Error("withdrawn publication remained visible");
  await rpc(host.client, "reveal_live_block", { p_session_id: sessionId, p_run_id: beforeRun });

  const notesRun = await activate(2);
  const noteResponse = await rpc(participant.client, "submit_live_block_response", { p_run_id: notesRun, p_answer: {}, p_text: "consented note", p_share_scope: "anonymous" });
  await rpc(host.client, "publish_live_response", { p_response_id: noteResponse, p_display_order: 0 });
  await rpc(host.client, "reveal_live_block", { p_session_id: sessionId, p_run_id: notesRun });
  const videoRun = await activate(3); await rpc(host.client, "close_live_block", { p_session_id: sessionId, p_run_id: videoRun });
  const reflectionRun = await activate(4);
  await rpc(participant.client, "submit_live_block_response", { p_run_id: reflectionRun, p_answer: {}, p_text: "private reflection", p_share_scope: "private" });
  await rpc(host.client, "reveal_live_block", { p_session_id: sessionId, p_run_id: reflectionRun });
  const cloudRun = await activate(5);
  const cloudResponse = await rpc(participant.client, "submit_live_block_response", { p_run_id: cloudRun, p_answer: { entries: ["agency", "consent"] }, p_text: null, p_share_scope: "anonymous" });
  await rpc(host.client, "publish_live_response", { p_response_id: cloudResponse, p_display_order: 0 });
  await rpc(host.client, "reveal_live_block", { p_session_id: sessionId, p_run_id: cloudRun });
  const cloudAggregate = await rpc(host.client, "get_live_block_aggregate", { p_run_id: cloudRun });
  if (cloudAggregate.items.length !== 2) throw new Error("word cloud aggregate incorrect");
  const afterRun = await activate(6);
  await rpc(participant.client, "submit_live_block_response", { p_run_id: afterRun, p_answer: { selections: ["b"] }, p_text: null, p_share_scope: "private" });
  await rpc(host.client, "reveal_live_block", { p_session_id: sessionId, p_run_id: afterRun });
  const comparisonAggregate = await rpc(host.client, "get_live_block_aggregate", { p_run_id: afterRun });
  if (!comparisonAggregate.comparison) throw new Error("before/after comparison missing");
  await rpc(host.client, "end_live_rundown_session", { p_session_id: sessionId });
  const recap = await rpc(host.client, "get_session_recap", { p_session_id: sessionId });
  console.log(JSON.stringify({ ok: true, sequence_blocks: rundown.blocks.length, recap_votes: recap[0].vote_count }));
} finally {
  if (sessionId) await admin.from("live_sessions").delete().eq("id", sessionId);
  for (const id of createdUsers.reverse()) await admin.auth.admin.deleteUser(id);
}
