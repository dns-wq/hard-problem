import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await supabase.from("live_runtime_config").select("key").eq("key", "rundown_v2_creation").limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true, service: "hard-problem", schema: "live-rundown-v2", latency_ms: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, service: "hard-problem", schema: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
