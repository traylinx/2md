#!/usr/bin/env python3

"""
extract_trafilatura.py — Step 2b: Fallback Content Extraction

Usage: python3 scripts/extract_trafilatura.py <job_dir>

Reads:  <job_dir>/input/rendered.html
Writes: <job_dir>/processing/extracted.md
"""

import sys
import json
import trafilatura
from os import path

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing job_dir argument"}))
        sys.exit(1)

    job_dir = sys.argv[1]
    input_file = path.join(job_dir, "input", "rendered.html")
    output_file = path.join(job_dir, "processing", "extracted.md")

    if not path.exists(input_file):
        print(json.dumps({"error": f"File not found: {input_file}"}))
        sys.exit(1)

    with open(input_file, "r", encoding="utf-8") as f:
        html_content = f.read()

    # Extract content as markdown. Trafilatura is great at boilerplate removal.
    # We ask it to include as much structure as possible.
    extracted_md = trafilatura.extract(
        html_content,
        include_links=True,
        include_formatting=True,
        include_images=True,
        include_tables=True,
        output_format="markdown"
    )

    # Some versions of trafilatura return None if extraction fails
    if not extracted_md or not extracted_md.strip():
        # Complete failure, just return generic
        print(json.dumps({"error": "Trafilatura extraction yielded empty string"}))
        sys.exit(1)

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(extracted_md)

    # optionally extract metadata
    metadata = trafilatura.extract_metadata(html_content)
    title = metadata.title if metadata and hasattr(metadata, 'title') and metadata.title else ""
    byline = metadata.author if metadata and hasattr(metadata, 'author') and metadata.author else ""
    excerpt = metadata.description if metadata and hasattr(metadata, 'description') and metadata.description else ""

    result = {
        "success": True,
        "method": "trafilatura",
        "title": title,
        "byline": byline,
        "excerpt": excerpt
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
