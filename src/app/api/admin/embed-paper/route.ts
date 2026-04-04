import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { chunkText } from "@/lib/chunking";
import { embedBatch } from "@/lib/openai";

// Admin-only: chunk and embed a paper's extracted text into paper_embeddings.
// Called from the admin CMS after Docling text has been saved.

export async function POST(request: Request) {
  // Verify the request comes from an authenticated editor/admin
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["editor", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { paperId } = body as { paperId?: string };

  if (!paperId) {
    return NextResponse.json({ error: "paperId is required" }, { status: 400 });
  }

  // Fetch the paper's extracted text using service role (bypasses RLS for admin op)
  const adminSupabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: paper, error: paperError } = await adminSupabase
    .from("papers")
    .select("id, full_extracted_text")
    .eq("id", paperId)
    .single();

  if (paperError || !paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  if (!paper.full_extracted_text) {
    return NextResponse.json(
      { error: "No extracted text — run Docling first and save the output" },
      { status: 400 },
    );
  }

  // Delete existing embeddings for this paper before re-generating
  await adminSupabase
    .from("paper_embeddings")
    .delete()
    .eq("paper_id", paperId);

  // Chunk the text
  const chunks = chunkText(paper.full_extracted_text);

  if (chunks.length === 0) {
    return NextResponse.json({ error: "No chunks generated from extracted text" }, { status: 400 });
  }

  // Embed in batches of 100 (OpenAI API limit)
  const BATCH_SIZE = 100;
  let totalInserted = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.text);
    const embeddings = await embedBatch(texts);

    const rows = batch.map((chunk, j) => ({
      paper_id: paperId,
      chunk_text: chunk.text,
      chunk_index: chunk.chunkIndex,
      embedding: embeddings[j],
    }));

    const { error: insertError } = await adminSupabase
      .from("paper_embeddings")
      .insert(rows);

    if (insertError) {
      return NextResponse.json(
        { error: `Failed to insert embeddings batch ${i / BATCH_SIZE}: ${insertError.message}` },
        { status: 500 },
      );
    }

    totalInserted += batch.length;
  }

  return NextResponse.json({ chunksCreated: totalInserted });
}
