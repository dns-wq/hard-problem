#!/usr/bin/env python3
"""
Hard Problem — Extract & Embed Papers
Reads PDFs/HTML with Docling, chunks, embeds via OpenAI text-embedding-3-small,
and inserts into Supabase paper_embeddings.

Usage: python scripts/extract_and_embed.py
"""

import os, re, sys, json, time
from pathlib import Path

# ── Load .env.local ──────────────────────────────────────────────────────────
env_path = Path(__file__).parent.parent / ".env.local"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        m = re.match(r"^([^#\s][^=]*)=(.*)$", line)
        if m:
            os.environ.setdefault(m.group(1).strip(), m.group(2).strip())

SUPABASE_URL      = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SERVICE_ROLE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OPENAI_API_KEY    = os.environ["OPENAI_API_KEY"]

import requests
import openai

openai_client = openai.OpenAI(api_key=OPENAI_API_KEY)

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

PDF_DIR = Path(__file__).parent / "pdfs"

# Map filename → paper title (must match what was seeded in seed-content.ts)
FILE_TO_TITLE = {
    "chalmers-facing-up.pdf":           "Facing Up to the Problem of Consciousness",
    "buolamwini-gender-shades.pdf":     "Gender Shades: Intersectional Accuracy Disparities in Commercial Gender Classification",
    "chouldechova-fair-prediction.pdf": "Fair Prediction with Disparate Impact: A Study of Bias in Recidivism Prediction Instruments",
    "dennett-quining-qualia.html":      "Quining Qualia",
    "nagel-what-is-it-like.pdf":        "What Is It Like to Be a Bat?",
    "nissenbaum-contextual-integrity.pdf": "Privacy as Contextual Integrity",
}

# ── Chunking (mirrors src/lib/chunking.ts) ───────────────────────────────────
TARGET_CHARS  = 500 * 4    # 2000 chars ≈ 500 tokens
OVERLAP_CHARS = 50  * 4    # 200  chars ≈ 50  tokens

def split_by_sections(md: str) -> list[str]:
    sections, current = [], []
    for line in md.splitlines():
        if re.match(r"^#{2,3}\s", line) and current:
            sections.append("\n".join(current))
            current = [line]
        else:
            current.append(line)
    if current:
        sections.append("\n".join(current))
    return sections

def split_by_sentences(text: str) -> list[str]:
    return [s + " " for s in re.split(r"(?<=[.!?])\s+", text)]

def chunk_text(markdown: str) -> list[dict]:
    raw: list[str] = []
    for section in split_by_sections(markdown):
        s = section.strip()
        if not s:
            continue
        if len(s) <= TARGET_CHARS:
            raw.append(s)
        else:
            current = ""
            for sent in split_by_sentences(s):
                if len(current + sent) > TARGET_CHARS and current:
                    raw.append(current.strip())
                    current = sent
                else:
                    current += sent
            if current.strip():
                raw.append(current.strip())

    result = []
    for i, chunk in enumerate(raw):
        text = chunk
        if i > 0:
            overlap = raw[i - 1][-OVERLAP_CHARS:]
            text = overlap + "\n\n" + chunk
        text = text.strip()
        if text:
            result.append({"text": text, "chunkIndex": i})
    return result

# ── OpenAI embedding ─────────────────────────────────────────────────────────
EMBED_MODEL = "text-embedding-3-small"
BATCH_SIZE  = 100

def embed_batch(texts: list[str]) -> list[list[float]]:
    resp = openai_client.embeddings.create(model=EMBED_MODEL, input=texts)
    return [item.embedding for item in resp.data]

# ── Supabase helpers ─────────────────────────────────────────────────────────
def find_paper_id(title: str) -> str | None:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/papers",
        headers=HEADERS,
        params={"title": f"eq.{title}", "select": "id"},
    )
    rows = r.json()
    return rows[0]["id"] if rows else None

def update_extracted_text(paper_id: str, text: str):
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/papers?id=eq.{paper_id}",
        headers=HEADERS,
        json={"full_extracted_text": text},
    )
    r.raise_for_status()

def delete_existing_embeddings(paper_id: str):
    r = requests.delete(
        f"{SUPABASE_URL}/rest/v1/paper_embeddings?paper_id=eq.{paper_id}",
        headers=HEADERS,
    )
    r.raise_for_status()

def insert_embeddings(rows: list[dict]):
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/paper_embeddings",
        headers=HEADERS,
        json=rows,
    )
    r.raise_for_status()

# ── Main ─────────────────────────────────────────────────────────────────────
def process_file(filepath: Path, paper_title: str):
    print(f"\n{'─'*60}")
    print(f"Processing: {filepath.name}")

    # 1. Extract with Docling
    print("  Extracting with Docling...")
    from docling.document_converter import DocumentConverter
    dc = DocumentConverter()
    result = dc.convert(str(filepath))
    markdown = result.document.export_to_markdown()
    print(f"  Extracted {len(markdown):,} chars")

    # 2. Find paper in DB
    paper_id = find_paper_id(paper_title)
    if not paper_id:
        print(f"  ✗ Paper not found in DB: '{paper_title}'")
        return

    # 3. Save extracted text
    update_extracted_text(paper_id, markdown)
    print(f"  ✓ Saved full_extracted_text → paper {paper_id[:8]}…")

    # 4. Chunk
    chunks = chunk_text(markdown)
    print(f"  Chunked into {len(chunks)} segments")
    if not chunks:
        print("  ✗ No chunks generated — skipping embed")
        return

    # 5. Delete existing embeddings
    delete_existing_embeddings(paper_id)

    # 6. Embed in batches
    total = 0
    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i : i + BATCH_SIZE]
        texts = [c["text"] for c in batch]
        print(f"  Embedding batch {i // BATCH_SIZE + 1}/{(len(chunks) - 1) // BATCH_SIZE + 1} ({len(texts)} chunks)…")
        embeddings = embed_batch(texts)

        rows = [
            {
                "paper_id":    paper_id,
                "chunk_text":  batch[j]["text"],
                "chunk_index": batch[j]["chunkIndex"],
                "embedding":   embeddings[j],
            }
            for j in range(len(batch))
        ]
        insert_embeddings(rows)
        total += len(batch)
        time.sleep(0.2)  # gentle rate limiting

    print(f"  ✓ Inserted {total} embeddings")


def main():
    print("Hard Problem — Extract & Embed Pipeline")

    from docling.document_converter import DocumentConverter  # warm-up import
    print("Docling ready.\n")

    files = [f for f in PDF_DIR.iterdir() if f.name in FILE_TO_TITLE]
    if not files:
        print(f"No recognised files in {PDF_DIR}")
        sys.exit(1)

    files.sort(key=lambda f: list(FILE_TO_TITLE.keys()).index(f.name))

    for filepath in files:
        title = FILE_TO_TITLE[filepath.name]
        try:
            process_file(filepath, title)
        except Exception as e:
            print(f"  ✗ ERROR: {e}")
            import traceback; traceback.print_exc()

    print(f"\n{'='*60}")
    print(f"Done. Processed {len(files)} files.")


if __name__ == "__main__":
    main()
