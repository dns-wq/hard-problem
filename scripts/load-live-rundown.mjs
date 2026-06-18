import { createClient } from "@supabase/supabase-js";

const url = process.env.LOAD_TEST_SUPABASE_URL;
const anonKey = process.env.LOAD_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOAD_TEST_SERVICE_ROLE_KEY;
const sessionId = process.env.LOAD_TEST_SESSION_ID;
const count = Number(process.env.LOAD_TEST_PARTICIPANTS ?? 150);
if (!url || !anonKey || !serviceKey || !sessionId) {
  throw new Error("Set LOAD_TEST_SUPABASE_URL, LOAD_TEST_SUPABASE_ANON_KEY, LOAD_TEST_SERVICE_ROLE_KEY, and LOAD_TEST_SESSION_ID.");
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data: session, error: sessionError } = await admin.from("live_sessions").select("current_block_run_id").eq("id", sessionId).single();
if (sessionError || !session?.current_block_run_id) throw new Error(`The load-test session needs a current block: ${sessionError?.message ?? "missing"}`);
const { data: run, error: runError } = await admin.from("live_block_runs").select("id,status,block_snapshot").eq("id", session.current_block_run_id).single();
if (runError || !run || run.status !== "active") throw new Error(`The load-test session needs an active block: ${runError?.message ?? "missing"}`);
const current = { run_id: run.id, status: run.status, snapshot: run.block_snapshot };

function responseFor(snapshot) {
  const options = snapshot.config?.options ?? [];
  if (snapshot.kind === "choice") return { answer: { selections: [options[0].id] }, text: null };
  if (snapshot.kind === "scale") return { answer: { value: snapshot.config.min ?? 1 }, text: null };
  if (snapshot.kind === "ranking") return { answer: { ranking: options.slice(0, snapshot.config.required_count ?? options.length).map((o) => o.id) }, text: null };
  if (snapshot.kind === "word_cloud") return { answer: { entries: ["load-test"] }, text: null };
  if (snapshot.kind === "open_text") return { answer: {}, text: "load-test response" };
  if (snapshot.kind === "quiz") return { answer: { answer: snapshot.config.question_type === "true_false" ? "true" : options[0].id }, text: null };
  throw new Error(`Unsupported active block: ${snapshot.kind}`);
}

const created = [];
const clients = [];
const started = Date.now();
try {
  for (let i = 0; i < count; i += 1) {
    const email = `rundown-load-${Date.now()}-${i}@example.invalid`;
    const password = `Load-${crypto.randomUUID()}!aA1`;
    const { data: user, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `Load ${i + 1}` } });
    if (error) throw error;
    created.push(user.user.id);
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    const { error: joinError } = await client.rpc("join_live_session", { p_session_id: sessionId, p_callable: false });
    if (joinError) throw joinError;
    const channel = client.channel(`load-session-${i}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_sessions", filter: `id=eq.${sessionId}` }, () => {});
    await channel.subscribe();
    clients.push({ client, channel });
  }
  if (clients.some(({ client }) => client.getChannels().length !== 1)) throw new Error("A participant client created more than one realtime subscription.");
  const response = responseFor(current.snapshot);
  const results = await Promise.all(clients.map(({ client }) => client.rpc("submit_live_block_response", {
    p_run_id: current.run_id, p_answer: response.answer, p_text: response.text, p_share_scope: "private",
  })));
  const failures = results.filter((result) => result.error);
  if (failures.length) throw new Error(`${failures.length} submissions failed; first: ${failures[0].error.message}`);
  const elapsed = Date.now() - started;
  console.log(JSON.stringify({ participants: count, submissions: count, elapsed_ms: elapsed, subscriptions_per_phone: 1 }));
} finally {
  await Promise.all(clients.map(({ client, channel }) => client.removeChannel(channel)));
  await Promise.all(created.map((id) => admin.auth.admin.deleteUser(id)));
}
