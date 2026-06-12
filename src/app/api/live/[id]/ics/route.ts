import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// .ics download for a scheduled session. Host or an RSVP'd attendee may download
// (the invite is meant for attendees' own calendars). The CSV recap stays
// host-only. Reads go through the service-role client because an RSVP'd user
// isn't a participant and RLS would hide the session row from them — so we
// re-assert host-OR-rsvp ourselves below.

function adminClient() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// RFC-5545 TEXT escaping
function icsText(text: string): string {
  return (text ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function fmtUTC(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

// RFC-5545 §3.1: fold content lines at 75 octets with CRLF + a leading space.
// Split on UTF-8 byte boundaries so multibyte chars (the em-dash) aren't broken.
function foldIcs(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const dec = new TextDecoder();
  const out: string[] = [];
  let i = 0;
  let first = true;
  while (i < bytes.length) {
    let end = Math.min(i + (first ? 75 : 74), bytes.length); // continuations reserve 1 octet for the space
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // back off to a char boundary
    out.push((first ? "" : " ") + dec.decode(bytes.slice(i, end)));
    i = end;
    first = false;
  }
  return out.join("\r\n");
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
    .select("id, code, host_id, topic_id, question, starts_at")
    .eq("id", id)
    .single();
  if (!session || !session.starts_at) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Host OR an RSVP'd attendee
  let allowed = session.host_id === user.id;
  if (!allowed) {
    const { data: rsvp } = await admin
      .from("live_rsvps")
      .select("user_id")
      .eq("session_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    allowed = !!rsvp;
  }
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: topic } = await admin.from("topics").select("title").eq("id", session.topic_id).single();
  const topicTitle = topic?.title ?? "Live session";

  const origin = new URL(request.url).origin;
  const start = new Date(session.starts_at);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // fixed 60-min block
  const joinUrl = `${origin}/live/play/${session.code}`;

  const body =
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Hard Problem//Live Sessions//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${session.id}@hardproblem.club`,
      `DTSTAMP:${fmtUTC(new Date())}`,
      `DTSTART:${fmtUTC(start)}`,
      `DTEND:${fmtUTC(end)}`,
      `SUMMARY:${icsText(`Hard Problem — ${topicTitle}`)}`,
      `DESCRIPTION:${icsText(`${session.question || "Live session"}\nJoin: ${joinUrl}`)}`,
      `URL:${joinUrl}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(foldIcs)
      .join("\r\n") + "\r\n";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="hard-problem-${session.code}.ics"`,
    },
  });
}
