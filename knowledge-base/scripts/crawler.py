"""
Phase 2 — OmniDimension Documentation Crawler
==============================================
Uses Crawl4AI (Playwright/Chromium) to crawl the locally running Vite dev
server, wait for React hydration, extract meaningful content, and write one
Markdown file per page into knowledge-base/<folder>/.

Usage:
    python knowledge-base/scripts/crawler.py

Prerequisites:
    pip install crawl4ai
    crawl4ai-setup            (installs Playwright browsers)
    Vite dev server running:  cd client && npm run dev
"""

import asyncio
import os
import sys
import re
import json
import time
from pathlib import Path
from datetime import datetime

# ── Imports ────────────────────────────────────────────────────────────────
try:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
    from crawl4ai.content_filter_strategy import PruningContentFilter
    from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator
except ImportError:
    print("ERROR: crawl4ai not installed. Run:  pip install crawl4ai  then  crawl4ai-setup")
    sys.exit(1)

# Add script dir to path so we can import config
sys.path.insert(0, str(Path(__file__).parent))
from crawl_config import (
    BASE_URL, PAGES, EXCLUDED_SELECTORS,
    WAIT_FOR_MS, EXTRA_SCROLL_WAIT_MS, OUTPUT_ROOT,
)

# ── Paths ──────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).parent
KB_ROOT      = (SCRIPT_DIR / OUTPUT_ROOT).resolve()   # knowledge-base/
REPORTS_DIR  = KB_ROOT / "scripts" / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


# ── Helpers ────────────────────────────────────────────────────────────────
def sanitize_markdown(raw: str, page_title: str, route: str) -> str:
    """
    Post-process raw Markdown from Crawl4AI:
    - Add YAML front-matter
    - Ensure a single H1 at the top
    - Normalise consecutive blank lines
    - Strip lines that are pure navigation artefacts
    """
    lines = raw.splitlines()

    # Remove lines that are clearly nav/footer artefacts
    nav_patterns = [
        r"^\s*Home\s*›",          # breadcrumb
        r"^\s*›\s*",
        r"^\s*Skip to (content|main)",
        r"^\[Skip",
        r"^\s*©\s*\d{4}",         # copyright line
        r"^\s*All rights reserved",
        r"^\s*Privacy Policy",
        r"^\s*Terms of Service",
        r"^\s*Cookie Policy",
        r"^\s*\|\s*$",            # bare pipe separators
    ]
    cleaned = []
    for line in lines:
        if any(re.match(p, line, re.IGNORECASE) for p in nav_patterns):
            continue
        cleaned.append(line)

    # Collapse 3+ consecutive blank lines into 2
    result = []
    blank_count = 0
    for line in cleaned:
        if line.strip() == "":
            blank_count += 1
            if blank_count <= 2:
                result.append(line)
        else:
            blank_count = 0
            result.append(line)

    body = "\n".join(result).strip()

    # Ensure H1 exists at top
    if not body.startswith("# "):
        body = f"# {page_title}\n\n{body}"

    # Prepend YAML front-matter
    front_matter = (
        f"---\n"
        f"title: \"{page_title}\"\n"
        f"route: \"{route}\"\n"
        f"source: \"{BASE_URL}{route}\"\n"
        f"crawled_at: \"{datetime.utcnow().isoformat()}Z\"\n"
        f"---\n\n"
    )
    return front_matter + body


def extract_summary(markdown: str, max_chars: int = 300) -> str:
    """Extract a plain-text summary from the first non-heading paragraph."""
    lines = markdown.splitlines()
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and not stripped.startswith("---") and not stripped.startswith("|"):
            return stripped[:max_chars] + ("…" if len(stripped) > max_chars else "")
    return ""


# ── Main Crawler ───────────────────────────────────────────────────────────
async def crawl_pages():
    stats = {
        "started_at": datetime.utcnow().isoformat() + "Z",
        "total": len(PAGES),
        "success": 0,
        "failed": 0,
        "skipped": 0,
        "pages": [],
    }

    browser_cfg = BrowserConfig(
        browser_type="chromium",
        headless=True,
        verbose=False,
        extra_args=[
            "--disable-web-security",        # allow localhost cross-origin
            "--no-sandbox",
            "--disable-gpu",
        ],
    )

    # Content filter: prune boilerplate (threshold 0.45 = moderate aggressiveness)
    content_filter = PruningContentFilter(threshold=0.45, threshold_type="fixed")

    md_generator = DefaultMarkdownGenerator(
        content_filter=content_filter,
        options={
            "ignore_links": False,
            "escape_html": True,
        },
    )

    run_cfg = CrawlerRunConfig(
        wait_until="networkidle",
        page_timeout=30_000,                # 30 s page load timeout
        delay_before_return_html=WAIT_FOR_MS / 1000,
        markdown_generator=md_generator,
        excluded_selector=", ".join(EXCLUDED_SELECTORS),
        exclude_external_links=True,
        exclude_social_media_links=True,
        remove_overlay_elements=True,
        simulate_user=True,                  # gentle scroll to trigger lazy loads
        magic=True,                          # auto-handles popups
        verbose=False,
    )

    print(f"\n{'='*60}")
    print(f"  OmniDimension Documentation Crawler")
    print(f"  Target: {BASE_URL}")
    print(f"  Pages : {len(PAGES)}")
    print(f"{'='*60}\n")

    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        for route, folder, filename, title in PAGES:
            url = BASE_URL + route
            out_dir = KB_ROOT / folder
            out_dir.mkdir(parents=True, exist_ok=True)
            out_path = out_dir / filename

            print(f"  >> [{title}]  {route}")

            try:
                result = await crawler.arun(url=url, config=run_cfg)

                if not result.success:
                    reason = getattr(result, "error_message", "unknown error")
                    print(f"    FAILED -- {reason}")
                    stats["failed"] += 1
                    stats["pages"].append({
                        "title": title,
                        "route": route,
                        "folder": folder,
                        "filename": filename,
                        "status": "failed",
                        "reason": reason,
                    })
                    continue

                # Prefer fit_markdown (filtered) over raw markdown
                raw_md = (
                    result.markdown.fit_markdown
                    if hasattr(result.markdown, "fit_markdown") and result.markdown.fit_markdown
                    else result.markdown.raw_markdown
                )

                if not raw_md or len(raw_md.strip()) < 50:
                    print(f"    SKIPPED -- content too short ({len(raw_md or '')} chars)")
                    stats["skipped"] += 1
                    stats["pages"].append({
                        "title": title,
                        "route": route,
                        "folder": folder,
                        "filename": filename,
                        "status": "skipped",
                        "reason": "content too short",
                    })
                    continue

                clean_md = sanitize_markdown(raw_md, title, route)
                out_path.write_text(clean_md, encoding="utf-8")

                char_count = len(clean_md)
                summary = extract_summary(clean_md)
                print(f"    OK -- {char_count:,} chars -> {out_path.relative_to(KB_ROOT)}")

                stats["success"] += 1
                stats["pages"].append({
                    "title": title,
                    "route": route,
                    "folder": folder,
                    "filename": filename,
                    "output_path": str(out_path.relative_to(KB_ROOT)),
                    "status": "success",
                    "char_count": char_count,
                    "summary": summary,
                })

            except Exception as exc:
                print(f"    ERROR -- {exc}")
                stats["failed"] += 1
                stats["pages"].append({
                    "title": title,
                    "route": route,
                    "folder": folder,
                    "filename": filename,
                    "status": "error",
                    "reason": str(exc),
                })

    stats["finished_at"] = datetime.utcnow().isoformat() + "Z"

    # Write raw stats for the report phase
    stats_path = REPORTS_DIR / "crawl_stats.json"
    stats_path.write_text(json.dumps(stats, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n{'='*60}")
    print(f"  Crawl complete")
    print(f"  Success : {stats['success']}")
    print(f"  Failed  : {stats['failed']}")
    print(f"  Skipped : {stats['skipped']}")
    print(f"  Stats   : {stats_path}")
    print("=" * 60 + "\n")

    return stats


if __name__ == "__main__":
    asyncio.run(crawl_pages())
