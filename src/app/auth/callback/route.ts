import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { safeRedirect } from "@/lib/redirect";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Server-side open-redirect guard: this route is reachable without a code
  // param, so the redirect value must never leave this origin.
  const redirectTo = safeRedirect(searchParams.get("redirect"));

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${redirectTo}`);
}
