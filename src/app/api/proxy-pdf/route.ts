import { NextResponse } from "next/server";

// Whitelist of domains whose PDFs may be proxied.
// Only open-access, freely-redistributable sources.
const ALLOWED_DOMAINS = [
  "arxiv.org",
  "ar5iv.labs.arxiv.org",
  "philarchive.org",
  "mit.edu",
  "seas.harvard.edu",
  "cs.princeton.edu",
  "openreview.net",
];

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB

function isAllowedDomain(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain),
    );
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pdfUrl = searchParams.get("url");

  if (!pdfUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  if (!isAllowedDomain(pdfUrl)) {
    return NextResponse.json(
      { error: "Domain not in whitelist" },
      { status: 403 },
    );
  }

  let response: Response;
  try {
    response = await fetch(pdfUrl, {
      headers: { "User-Agent": "HardProblem/1.0 (open-access PDF proxy)" },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch PDF" }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: `Upstream returned ${response.status}` },
      { status: 502 },
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
    return NextResponse.json(
      { error: "URL does not appear to be a PDF" },
      { status: 400 },
    );
  }

  // Check content-length if provided; reject oversized files early
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "PDF exceeds size limit (20 MB)" }, { status: 413 });
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "PDF exceeds size limit (20 MB)" }, { status: 413 });
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "public, max-age=3600",
      // Strip X-Frame-Options so our inline viewer can render it
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
