import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Host-only per-participant CSV recap. Uses the service-role client (which
// BYPASSES RLS), so the route MUST re-assert host_id === user.id itself — that
// is the security boundary, not RLS.

function adminClient() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// RFC-4180 cell quoting
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminClient();
  const { data: session } = await admin
    .from("live_sessions")
    .select("id, code, host_id")
    .eq("id", id)
    .single();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.host_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [{ data: participants }, { data: responses }, { data: options }, { data: draws }] = await Promise.all([
    admin.from("live_participants").select("user_id, display_name").eq("session_id", id),
    admin.from("live_responses").select("user_id, option_id, note").eq("session_id", id),
    admin.from("live_session_options").select("id, label").eq("session_id", id),
    admin.from("live_spotlight_draws").select("drawn_user_id, outcome, note_shared").eq("session_id", id),
  ]);

  const optLabel = new Map((options ?? []).map((o) => [o.id, o.label]));
  const respByUser = new Map((responses ?? []).map((r) => [r.user_id, r]));
  const drawsByUser = new Map<string, { outcome: string; note_shared: boolean }[]>();
  for (const d of draws ?? []) {
    const arr = drawsByUser.get(d.drawn_user_id) ?? [];
    arr.push(d);
    drawsByUser.set(d.drawn_user_id, arr);
  }

  const header = ["display_name", "voted_for", "note", "times_spotlighted", "times_shared"];
  const rows = (participants ?? []).map((p) => {
    const r = respByUser.get(p.user_id);
    const ds = drawsByUser.get(p.user_id) ?? [];
    return [
      p.display_name,
      r ? optLabel.get(r.option_id) ?? "" : "",
      r?.note ?? "",
      ds.filter((d) => d.outcome !== "cleared").length,
      // Matches get_session_recap / get_live_transcript: shared OR projected-note
      ds.filter((d) => d.outcome === "shared" || d.note_shared).length,
    ];
  });

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hard-problem-recap-${session.code}.csv"`,
    },
  });
}
