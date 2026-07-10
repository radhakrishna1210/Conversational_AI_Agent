"""
run_pipeline.py — Full Documentation Pipeline Orchestrator
===========================================================
Runs all five phases in sequence:
  Phase 2 — Crawl
  Phase 3 — Cleanup
  Phase 4 — Index
  Phase 5 — Report

Usage:
    python knowledge-base/scripts/run_pipeline.py

Prerequisites:
  1. Vite dev server is running:  cd client && npm run dev
  2. crawl4ai installed:          pip install crawl4ai
  3. Browsers installed:          crawl4ai-setup
"""

import asyncio
import sys
import time
from pathlib import Path

# Make sure our scripts directory is on the path
sys.path.insert(0, str(Path(__file__).parent))


def banner(phase: str, desc: str):
    print(f"\n{'='*60}")
    print(f"  {phase} — {desc}")
    print(f"{'='*60}\n")


async def run_all():
    t0 = time.time()

    # ── Phase 2: Crawl ────────────────────────────────────────────────────
    banner("Phase 2", "Crawling localhost:5173")
    from crawler import crawl_pages
    stats = await crawl_pages()

    if stats["success"] == 0:
        print("\nSTOP: No pages were successfully crawled.")
        print("   Make sure the Vite dev server is running on port 5173.")
        print("   Command:  cd client && npm run dev\n")
        sys.exit(1)

    # ── Phase 3: Cleanup ──────────────────────────────────────────────────
    banner("Phase 3", "Markdown cleanup & normalisation")
    from cleanup import main as run_cleanup
    run_cleanup()

    # ── Phase 4: Index ────────────────────────────────────────────────────
    banner("Phase 4", "Generating sitemap.json & pages.json")
    from generate_index import main as run_index
    run_index()

    # ── Phase 5: Report ───────────────────────────────────────────────────
    banner("Phase 5", "Generating CRAWL_REPORT.md")
    from generate_report import main as run_report
    run_report()

    elapsed = time.time() - t0
    print(f"\n{'='*60}")
    print(f"  DONE: Pipeline complete in {elapsed:.1f}s")
    print(f"  Output: knowledge-base/")
    print(f"  Report: knowledge-base/CRAWL_REPORT.md")
    print(f"  Index : knowledge-base/pages.json")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    asyncio.run(run_all())
