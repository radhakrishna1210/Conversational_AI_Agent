"""
Phase 4 — Index Generation
===========================
Reads all successfully crawled Markdown files and produces:
  knowledge-base/sitemap.json  — machine-readable sitemap
  knowledge-base/pages.json    — rich page manifest with summaries

Usage:
    python knowledge-base/scripts/generate_index.py
"""

import json
import re
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from crawl_config import OUTPUT_ROOT, PAGES

SCRIPT_DIR = Path(__file__).parent
KB_ROOT    = (SCRIPT_DIR / OUTPUT_ROOT).resolve()


def parse_front_matter(text: str) -> dict:
    """Extract YAML front-matter fields (title, route, crawled_at)."""
    fm = {}
    m = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, _, v = line.partition(":")
                fm[k.strip()] = v.strip().strip('"')
    return fm


def extract_summary(text: str, max_chars: int = 280) -> str:
    """Extract first meaningful paragraph after the front-matter and H1."""
    # Skip front-matter
    text = re.sub(r'^---.*?---\n', '', text, flags=re.DOTALL).strip()
    # Skip first heading
    text = re.sub(r'^#[^\n]*\n', '', text).strip()

    for line in text.splitlines():
        stripped = line.strip()
        if (stripped
                and not stripped.startswith("#")
                and not stripped.startswith("|")
                and not stripped.startswith("!")
                and len(stripped) > 30):
            return stripped[:max_chars] + ("…" if len(stripped) > max_chars else "")
    return ""


def extract_headings(text: str) -> list:
    """Return list of all H2/H3 headings (as plain text) from a document."""
    headings = []
    for line in text.splitlines():
        m = re.match(r'^(#{2,3})\s+(.*)', line)
        if m:
            headings.append(m.group(2).strip())
    return headings


def count_words(text: str) -> int:
    # Strip front-matter and Markdown syntax
    text = re.sub(r'^---.*?---', '', text, flags=re.DOTALL)
    text = re.sub(r'[#*`_\[\]|]', ' ', text)
    return len(text.split())


def main():
    print(f"\n{'='*60}")
    print(f"  Phase 4 — Index Generation")
    print(f"{'='*60}\n")

    pages_index  = []
    sitemap      = []

    # Walk the page manifest in declared order
    for route, folder, filename, title in PAGES:
        md_path = KB_ROOT / folder / filename

        if not md_path.exists():
            print(f"  ⚠ MISSING  {folder}/{filename}  (not yet crawled)")
            sitemap.append({
                "title": title,
                "route": route,
                "folder": folder,
                "filename": filename,
                "status": "missing",
            })
            continue

        text = md_path.read_text(encoding="utf-8")
        fm   = parse_front_matter(text)

        entry = {
            "title":          fm.get("title", title),
            "route":          fm.get("route", route),
            "folder":         folder,
            "filename":       filename,
            "markdown_path":  f"{folder}/{filename}",
            "source_url":     fm.get("source", f"http://localhost:5173{route}"),
            "crawled_at":     fm.get("crawled_at", "unknown"),
            "summary":        extract_summary(text),
            "headings":       extract_headings(text),
            "word_count":     count_words(text),
            "char_count":     len(text),
            "status":         "indexed",
        }

        pages_index.append(entry)

        sitemap.append({
            "title":       entry["title"],
            "route":       entry["route"],
            "markdown_path": entry["markdown_path"],
            "summary":     entry["summary"],
        })

        print(f"  ✓ {entry['title']:<38}  {entry['word_count']:>5} words  {len(entry['headings'])} headings")

    # Write outputs
    pages_path   = KB_ROOT / "pages.json"
    sitemap_path = KB_ROOT / "sitemap.json"

    pages_path.write_text(
        json.dumps(pages_index, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    sitemap_path.write_text(
        json.dumps({
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "base_url":     "http://localhost:5173",
            "total_pages":  len(sitemap),
            "pages":        sitemap,
        }, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    indexed = sum(1 for p in pages_index if p["status"] == "indexed")
    print(f"\n  Indexed : {indexed}/{len(PAGES)} pages")
    print(f"  Output  : {pages_path.relative_to(KB_ROOT.parent)}")
    print(f"  Sitemap : {sitemap_path.relative_to(KB_ROOT.parent)}\n")


if __name__ == "__main__":
    main()
