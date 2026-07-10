"""
Phase 5 — Report Generator
===========================
Reads crawl_stats.json and pages.json to produce a human-readable
Markdown report: knowledge-base/CRAWL_REPORT.md

Usage:
    python knowledge-base/scripts/generate_report.py
"""

import json
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from crawl_config import OUTPUT_ROOT, PAGES

SCRIPT_DIR   = Path(__file__).parent
KB_ROOT      = (SCRIPT_DIR / OUTPUT_ROOT).resolve()
REPORTS_DIR  = KB_ROOT / "scripts" / "reports"


def load_json(path: Path) -> dict | list | None:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def main():
    stats      = load_json(REPORTS_DIR / "crawl_stats.json") or {}
    pages_idx  = load_json(KB_ROOT / "pages.json") or []
    sitemap    = load_json(KB_ROOT / "sitemap.json") or {}

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    lines = [
        "# OmniDimension Documentation Crawl Report",
        "",
        f"> Generated: {now}",
        "",
        "---",
        "",
        "## Summary",
        "",
    ]

    total   = stats.get("total",   len(PAGES))
    success = stats.get("success", 0)
    failed  = stats.get("failed",  0)
    skipped = stats.get("skipped", 0)

    lines += [
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| Target URL | `http://localhost:5173` |",
        f"| Total pages planned | {total} |",
        f"| Successfully crawled | {success} |",
        f"| Failed | {failed} |",
        f"| Skipped (no content) | {skipped} |",
        f"| Crawl started | {stats.get('started_at', 'N/A')} |",
        f"| Crawl finished | {stats.get('finished_at', 'N/A')} |",
        "",
        "---",
        "",
        "## Files Created",
        "",
    ]

    # Group pages by folder
    by_folder: dict = {}
    for p in pages_idx:
        folder = p.get("folder", "Other")
        by_folder.setdefault(folder, []).append(p)

    for folder in sorted(by_folder.keys()):
        lines.append(f"### {folder.replace('/', ' › ')}")
        lines.append("")
        lines.append("| File | Words | Summary |")
        lines.append("|------|-------|---------|")
        for p in by_folder[folder]:
            fname   = p.get("filename", "")
            words   = p.get("word_count", 0)
            summary = p.get("summary", "")[:100].replace("|", "\\|")
            lines.append(f"| `{folder}/{fname}` | {words} | {summary} |")
        lines.append("")

    # Pages crawled
    lines += [
        "---",
        "",
        "## Pages Discovered",
        "",
        "| Status | Title | Route | Output |",
        "|--------|-------|-------|--------|",
    ]

    page_records = stats.get("pages", [])
    for p in page_records:
        status  = p.get("status", "unknown")
        icon    = {"success": "✅", "failed": "❌", "skipped": "⚠️", "error": "🔴"}.get(status, "❓")
        title   = p.get("title", "")
        route   = p.get("route", "")
        out     = p.get("output_path", p.get("reason", ""))
        lines.append(f"| {icon} {status} | {title} | `{route}` | `{out}` |")

    lines += [
        "",
        "---",
        "",
        "## Pages Skipped",
        "",
        "_Pages below are protected (require login) or were intentionally excluded:_",
        "",
        "| Route | Reason |",
        "|-------|--------|",
        "| `/dashboard` | Requires authentication |",
        "| `/admin` | Requires admin role |",
        "| `/login` | Auth page — no product content |",
        "| `/signup` | Auth page — no product content |",
        "| `/billing` | Auth + user-specific data |",
        "| `/analytics` | Auth + user-specific data |",
        "| `/settings` | Auth + user-specific data |",
        "| `/agent/:id` | Dynamic — requires existing agent |",
        "| `/bulk_call` | Auth + operational UI |",
        "| `/clone_voice` | Auth + operational UI |",
        "| `/files` | Auth + operational UI |",
        "| `/phone_numbers` | Auth + operational UI |",
        "| `/call_logs` | Auth + operational UI |",
        "| `/whatsapp` | Auth + operational UI |",
        "| `/api_keys` | Auth + sensitive credentials |",
        "| `/auth/callback` | OAuth callback — no content |",
        "| `/notifications/archive` | Auth + ephemeral content |",
        "",
        "---",
        "",
        "## Pages Requiring Manual Documentation",
        "",
        "The following pages have content that cannot be fully captured by a browser crawler",
        "and should be manually documented before RAG ingestion:",
        "",
        "| Page | Route | Reason |",
        "|------|-------|--------|",
        "| Dashboard | `/dashboard` | Auth-gated; shows live agent data |",
        "| Edit Agent | `/agent/:id` | Auth-gated; highly dynamic per-agent config |",
        "| Admin Panel | `/admin` | Admin-only; contains system configuration |",
        "| Billing | `/billing` | Auth-gated; subscription/usage details |",
        "| Integrations (dashboard) | `/integrations` | Auth-gated; live OAuth status |",
        "| Pricing — FAQ tab | `/pricing` | Requires tab click interaction |",
        "",
        "---",
        "",
        "## Knowledge Base Structure",
        "",
        "```",
        "knowledge-base/",
        "├── Home/",
        "├── Pricing/",
        "├── Documentation/",
        "├── Contact/",
        "├── BookAppointment/",
        "├── ReportIssue/",
        "├── Integrations/",
        "│   ├── CalCom/",
        "│   ├── Salesforce/",
        "│   ├── CustomAPI/",
        "│   └── SIPTrunking/",
        "├── Solutions/",
        "│   ├── Finance/",
        "│   ├── Education/",
        "│   ├── Ecommerce/",
        "│   ├── RealEstate/",
        "│   ├── Insurance/",
        "│   ├── Healthcare/",
        "│   ├── Restaurants/",
        "│   ├── LeadGeneration/",
        "│   ├── Collections/",
        "│   ├── Negotiation/",
        "│   ├── CustomerSupport/",
        "│   └── Appointments/",
        "├── sitemap.json",
        "├── pages.json",
        "├── CRAWL_REPORT.md",
        "└── scripts/",
        "    ├── crawl_config.py",
        "    ├── crawler.py",
        "    ├── cleanup.py",
        "    ├── generate_index.py",
        "    ├── generate_report.py",
        "    ├── run_pipeline.py",
        "    └── reports/",
        "        └── crawl_stats.json",
        "```",
        "",
        "---",
        "",
        "_This report was generated by the OmniDimension documentation pipeline._",
        "_It is intended for senior review before RAG ingestion._",
    ]

    report = "\n".join(lines)
    report_path = KB_ROOT / "CRAWL_REPORT.md"
    report_path.write_text(report, encoding="utf-8")
    print(f"  Report written → {report_path.relative_to(KB_ROOT.parent)}")


if __name__ == "__main__":
    main()
