"""
Phase 3 — Markdown Cleanup & Normalisation
==========================================
Reads all .md files under knowledge-base/, removes duplicate sections,
normalises headings, and rewrites the files in-place.

Usage:
    python knowledge-base/scripts/cleanup.py
"""

import re
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from crawl_config import OUTPUT_ROOT

SCRIPT_DIR = Path(__file__).parent
KB_ROOT    = (SCRIPT_DIR / OUTPUT_ROOT).resolve()


# ── Heading normalisation ──────────────────────────────────────────────────
def normalise_headings(text: str) -> str:
    """
    Ensure heading hierarchy starts at H1 and doesn't skip levels.
    e.g. if the page only has H3/H4, promote them to H2/H3.
    """
    lines = text.splitlines()
    heading_lines = [(i, len(m.group(1)), m.group(2).strip())
                     for i, line in enumerate(lines)
                     if (m := re.match(r'^(#{1,6})\s+(.*)', line))]

    if not heading_lines:
        return text

    # Find the minimum heading level used (excluding the front H1)
    levels_used = sorted({lvl for _, lvl, _ in heading_lines})
    first_level = levels_used[0]

    if first_level == 1 and len(levels_used) > 1:
        second_level = levels_used[1]
        # Shift everything so second_level maps to 2
        shift = second_level - 2
    else:
        shift = first_level - 1

    if shift == 0:
        return text

    new_lines = list(lines)
    for idx, lvl, content in heading_lines:
        new_lvl = max(1, lvl - shift)
        new_lines[idx] = "#" * new_lvl + " " + content

    return "\n".join(new_lines)


# ── Duplicate section detection ────────────────────────────────────────────
def remove_duplicate_sections(text: str) -> str:
    """
    Split document into sections by heading.
    If two sections share the same heading text (case-insensitive),
    keep only the first occurrence.
    """
    # Split on any heading line
    parts = re.split(r'(?m)^(#{1,6} .+)$', text)
    # parts alternates: [pre-heading text, heading, body, heading, body, ...]

    seen_headings: set = set()
    result_parts = [parts[0]]  # preamble (front-matter etc.)

    i = 1
    while i < len(parts) - 1:
        heading = parts[i]
        body    = parts[i + 1] if i + 1 < len(parts) else ""
        key     = re.sub(r'^#+\s*', '', heading).strip().lower()

        if key not in seen_headings:
            seen_headings.add(key)
            result_parts.append(heading)
            result_parts.append(body)
        # else: duplicate — silently drop

        i += 2

    return "".join(result_parts)


# ── Whitespace cleanup ─────────────────────────────────────────────────────
def clean_whitespace(text: str) -> str:
    """Collapse excess blank lines, strip trailing spaces."""
    lines = text.splitlines()
    cleaned = []
    blank_run = 0
    for line in lines:
        stripped = line.rstrip()
        if stripped == "":
            blank_run += 1
            if blank_run <= 2:
                cleaned.append("")
        else:
            blank_run = 0
            cleaned.append(stripped)
    return "\n".join(cleaned).strip() + "\n"


# ── Remove repeated boilerplate phrases ───────────────────────────────────
BOILERPLATE_PATTERNS = [
    r"(?m)^Get started for free\.?\s*$",
    r"(?m)^Try OmniDimension today\.?\s*$",
    r"(?m)^Ready to get started\??\.?\s*$",
]

def remove_boilerplate(text: str) -> str:
    for pattern in BOILERPLATE_PATTERNS:
        text = re.sub(pattern, "", text)
    return text


# ── Process a single file ──────────────────────────────────────────────────
def process_file(path: Path) -> dict:
    original = path.read_text(encoding="utf-8")
    text = original

    text = remove_duplicate_sections(text)
    text = normalise_headings(text)
    text = remove_boilerplate(text)
    text = clean_whitespace(text)

    changed = text != original
    if changed:
        path.write_text(text, encoding="utf-8")

    return {
        "file": str(path.relative_to(KB_ROOT)),
        "changed": changed,
        "original_chars": len(original),
        "cleaned_chars": len(text),
    }


# ── Main ───────────────────────────────────────────────────────────────────
def main():
    md_files = [p for p in KB_ROOT.rglob("*.md")
                if "scripts" not in p.parts]

    if not md_files:
        print("No Markdown files found under knowledge-base/. Run crawler.py first.")
        sys.exit(0)

    print(f"\n{'='*60}")
    print(f"  Phase 3 — Cleanup & Normalisation")
    print(f"  Files to process: {len(md_files)}")
    print(f"{'='*60}\n")

    results = []
    for f in sorted(md_files):
        res = process_file(f)
        status = "✎ modified" if res["changed"] else "  unchanged"
        delta  = res["cleaned_chars"] - res["original_chars"]
        sign   = "+" if delta >= 0 else ""
        print(f"  {status}  {res['file']}  ({sign}{delta} chars)")
        results.append(res)

    changed = sum(1 for r in results if r["changed"])
    print(f"\n  Done — {changed}/{len(md_files)} files modified\n")
    return results


if __name__ == "__main__":
    main()
