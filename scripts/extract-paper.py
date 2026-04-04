#!/usr/bin/env python3
"""
Hard Problem — Docling PDF extraction script
Usage: python scripts/extract-paper.py <path/to/paper.pdf>

Output: JSON to stdout with { markdown, title, page_count }
Paste the 'markdown' value into the admin CMS paper editor → "Extracted text" field,
then click "Embed paper" to generate pgvector embeddings.

Install dependencies: pip install -r scripts/requirements.txt
"""

import sys
import json

def extract(pdf_path: str) -> dict:
    try:
        from docling.document_converter import DocumentConverter
    except ImportError:
        print(
            "Docling not installed. Run: pip install -r scripts/requirements.txt",
            file=sys.stderr,
        )
        sys.exit(1)

    converter = DocumentConverter()
    result = converter.convert(pdf_path)
    markdown = result.document.export_to_markdown()

    return {
        "markdown": markdown,
        "title": getattr(result.document, "name", None),
        "page_count": len(getattr(result, "pages", [])),
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/extract-paper.py <path/to/paper.pdf>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    output = extract(pdf_path)
    print(json.dumps(output, indent=2, ensure_ascii=False))
