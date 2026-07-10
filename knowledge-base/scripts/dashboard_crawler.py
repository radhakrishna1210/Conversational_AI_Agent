"""
Phase 2 - Authenticated Dashboard Crawler
==========================================
Logs in via the REST API (no browser form filling), injects the JWT
into the browser's localStorage, then crawls every protected dashboard
page in that authenticated Playwright session.

Usage:
    python knowledge-base/scripts/dashboard_crawler.py
"""

import asyncio
import json
import sys
import re
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime

try:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
    from crawl4ai.content_filter_strategy import PruningContentFilter
    from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator
except ImportError:
    print("ERROR: crawl4ai not installed. Run: pip install crawl4ai then crawl4ai-setup")
    sys.exit(1)

sys.path.insert(0, str(Path(__file__).parent))
from dashboard_crawl_config import (
    BASE_URL, LOGIN_EMAIL, LOGIN_PASSWORD,
    DASHBOARD_PAGES, DASHBOARD_FOLDER, EXCLUDED_SELECTORS,
    PAGE_WAIT_MS, API_SETTLE_MS, SESSION_ID,
)

# ── Paths ──────────────────────────────────────────────────────────────────
SCRIPT_DIR  = Path(__file__).parent
KB_ROOT     = (SCRIPT_DIR / "..").resolve()
OUT_DIR     = KB_ROOT / DASHBOARD_FOLDER
REPORTS_DIR = KB_ROOT / "scripts" / "reports"
OUT_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

# ── JS: expand accordions and click tabs ──────────────────────────────────
EXPAND_JS = """
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // Expand closed accordions
    for (const el of document.querySelectorAll(
        '[data-state="closed"], .accordion-trigger, [aria-expanded="false"]'
    )) {
        try { el.click(); await sleep(200); } catch(_) {}
    }

    // Click non-active tabs
    for (const btn of document.querySelectorAll(
        '[role="tab"]:not([aria-selected="true"]), .tab-btn:not(.active), .pricing-tab:not(.active)'
    )) {
        try { btn.click(); await sleep(300); } catch(_) {}
    }

    // Scroll to trigger lazy loads
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(600);
    window.scrollTo(0, 0);
})();
"""

# ── Nav patterns to strip from extracted Markdown ─────────────────────────
NAV_PATTERNS = [
    r"^\s*VOICE AI SETUP\s*$", r"^\s*OPERATIONS & MONITORING\s*$",
    r"^\s*ACCOUNT & BILLING\s*$", r"^\s*RESOURCES\s*$", r"^\s*CHAT\s*$",
    r"^\s*Real-time TTS\s*$", r"^\s*Clone Voice\s*$", r"^\s*Bulk Call\s*$",
    r"^\s*Call Logs\s*$", r"^\s*Analytics\s*$", r"^\s*Integrations\s*$",
    r"^\s*Phone Numbers\s*$", r"^\s*Files\s*$", r"^\s*WhatsApp\s*$",
    r"^\s*WhaBridge\s*$", r"^\s*Billing\s*$", r"^\s*API\s*$",
    r"^\s*Settings\s*$", r"^\s*Logout\s*$", r"^\s*Profile\s*$",
    r"^\s*Docs\s*$", r"^\s*Contact Us\s*$", r"^\s*Report Issue\s*$",
    r"^\s*Admin Panel\s*$", r"^\s*OMNIDIMENSION\s*$",
    r"^\s*Search or jump to\.\.\.", r"^\s*[Ctrl]\s*K\s*$",
]


# ── Helpers ─────────────────────────────────────────────────────────────────
def sanitize_markdown(raw: str, title: str, route: str, category: str) -> str:
    lines = raw.splitlines()
    cleaned = [l for l in lines if not any(re.match(p, l, re.IGNORECASE) for p in NAV_PATTERNS)]

    result = []
    blank = 0
    for line in cleaned:
        if line.strip() == "":
            blank += 1
            if blank <= 2:
                result.append(line)
        else:
            blank = 0
            result.append(line)

    body = "\n".join(result).strip()
    if not body.startswith("# "):
        body = f"# {title}\n\n{body}"

    front = (
        f"---\n"
        f"title: \"{title}\"\n"
        f"route: \"{route}\"\n"
        f"category: \"{category}\"\n"
        f"source: \"{BASE_URL}{route}\"\n"
        f"auth_required: true\n"
        f"crawled_at: \"{datetime.utcnow().isoformat()}Z\"\n"
        f"---\n\n"
    )
    return front + body


def extract_summary(md: str, max_chars: int = 280) -> str:
    text = re.sub(r"^---.*?---\n", "", md, flags=re.DOTALL).strip()
    text = re.sub(r"^#[^\n]*\n", "", text).strip()
    for line in text.splitlines():
        s = line.strip()
        if s and not s.startswith("#") and not s.startswith("|") and len(s) > 20:
            return s[:max_chars] + ("..." if len(s) > max_chars else "")
    return ""


# ── Step 1: API login (no browser) ────────────────────────────────────────
def api_login() -> tuple:
    """
    POST /api/v1/auth/login via Python urllib.
    Returns (ok: bool, access_token: str, refresh_token: str).
    """
    api_url = "http://localhost:4000/api/v1/auth/login"
    payload = json.dumps({"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD}).encode()
    req = urllib.request.Request(api_url, data=payload,
                                 headers={"Content-Type": "application/json"},
                                 method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            token   = data.get("accessToken", "")
            refresh = data.get("refreshToken", "")
            user    = data.get("user", {})
            print(f"  [auth] API login OK -- {user.get('name','?')} ({user.get('email','?')})")
            print(f"  [auth] Token: {token[:40]}...")
            return True, token, refresh
    except urllib.error.HTTPError as e:
        print(f"  [auth] HTTP {e.code}: {e.read().decode(errors='replace')}")
        return False, "", ""
    except Exception as exc:
        print(f"  [auth] Error: {exc}")
        return False, "", ""


# ── Step 2: Warm-up browser session by injecting token ─────────────────────
async def warm_up_session(crawler: AsyncWebCrawler, token: str, refresh: str) -> bool:
    """
    Opens /dashboard, injects the JWT into localStorage BEFORE React
    hydration so the ProtectedRoute guard sees the token.
    """
    inject_js = (
        f"localStorage.setItem('token', '{token}');"
        f"localStorage.setItem('refreshToken', '{refresh}');"
        f"localStorage.setItem('userName', 'Admin User');"
        f"localStorage.setItem('userEmail', '{LOGIN_EMAIL}');"
    )

    cfg = CrawlerRunConfig(
        session_id=SESSION_ID,
        wait_until="networkidle",
        page_timeout=25_000,
        delay_before_return_html=PAGE_WAIT_MS / 1000,
        js_code=[inject_js],
        verbose=False,
    )

    print("  [auth] Opening /dashboard with token injected into localStorage...")
    result = await crawler.arun(url=BASE_URL + "/dashboard", config=cfg)

    if not result.success:
        print(f"  [auth] Failed to open /dashboard: {getattr(result, 'error_message', '?')}")
        return False

    # Soft check: if we got redirected to /login, auth didn't work
    url = getattr(result, "url", "") or ""
    if "/login" in url and "/dashboard" not in url:
        print(f"  [auth] Redirected to login -- token injection failed")
        return False

    html = result.html or ""
    markers = ["Voice AI Assistants", "sidebar", "dashboard-main", "dashboard-layout",
               "voice_ai_agents", "Create Agent", "dashboard-content"]
    if any(m in html for m in markers):
        print("  [auth] Dashboard loaded -- session is authenticated")
    else:
        print("  [auth] Dashboard opened (sparse content, may be empty account)")

    return True


# ── Step 3: Crawl each page ────────────────────────────────────────────────
async def crawl_pages(crawler: AsyncWebCrawler, token: str) -> dict:
    content_filter = PruningContentFilter(threshold=0.40, threshold_type="fixed")
    md_gen = DefaultMarkdownGenerator(
        content_filter=content_filter,
        options={"ignore_links": False, "escape_html": True},
    )

    stats = {
        "started_at":   datetime.utcnow().isoformat() + "Z",
        "auth_status":  "authenticated",
        "total":        len(DASHBOARD_PAGES),
        "success":      0, "failed": 0, "skipped": 0, "inaccessible": 0,
        "pages":        [],
    }

    # Belt-and-suspenders: re-inject token on every page visit
    inject_js = (
        f"localStorage.setItem('token', '{token}');"
        f"localStorage.setItem('userEmail', '{LOGIN_EMAIL}');"
    )

    for route, filename, title, category in DASHBOARD_PAGES:
        url      = BASE_URL + route
        out_path = OUT_DIR / filename
        print(f"  >> [{title}]  {route}")

        cfg = CrawlerRunConfig(
            session_id=SESSION_ID,
            wait_until="networkidle",
            page_timeout=30_000,
            delay_before_return_html=(PAGE_WAIT_MS + API_SETTLE_MS) / 1000,
            js_code=[inject_js, EXPAND_JS],
            markdown_generator=md_gen,
            excluded_selector=", ".join(EXCLUDED_SELECTORS),
            exclude_external_links=True,
            exclude_social_media_links=True,
            remove_overlay_elements=True,
            simulate_user=True,
            magic=True,
            verbose=False,
        )

        try:
            result = await crawler.arun(url=url, config=cfg)

            if not result.success:
                reason = getattr(result, "error_message", "crawl failed")
                print(f"    FAILED -- {reason}")
                stats["failed"] += 1
                stats["pages"].append({"title": title, "route": route,
                    "filename": filename, "category": category,
                    "status": "failed", "reason": reason})
                continue

            final_url = getattr(result, "url", "") or ""
            if "/login" in final_url and "/dashboard" not in final_url:
                print(f"    INACCESSIBLE -- redirected to login")
                stats["inaccessible"] += 1
                stats["pages"].append({"title": title, "route": route,
                    "filename": filename, "category": category,
                    "status": "inaccessible", "reason": "redirected to login"})
                continue

            raw_md = (
                result.markdown.fit_markdown
                if hasattr(result.markdown, "fit_markdown") and result.markdown.fit_markdown
                else result.markdown.raw_markdown
            )

            if not raw_md or len(raw_md.strip()) < 50:
                print(f"    SKIPPED -- too short ({len(raw_md or '')} chars)")
                stats["skipped"] += 1
                stats["pages"].append({"title": title, "route": route,
                    "filename": filename, "category": category,
                    "status": "skipped", "reason": "content too short"})
                continue

            clean = sanitize_markdown(raw_md, title, route, category)
            out_path.write_text(clean, encoding="utf-8")

            summary = extract_summary(clean)
            print(f"    OK -- {len(clean):,} chars -> {DASHBOARD_FOLDER}/{filename}")

            stats["success"] += 1
            stats["pages"].append({
                "title": title, "route": route, "filename": filename,
                "category": category,
                "markdown_path": f"{DASHBOARD_FOLDER}/{filename}",
                "source_url": f"{BASE_URL}{route}",
                "status": "success",
                "char_count": len(clean),
                "summary": summary,
                "crawled_at": datetime.utcnow().isoformat() + "Z",
            })

        except Exception as exc:
            print(f"    ERROR -- {exc}")
            stats["failed"] += 1
            stats["pages"].append({"title": title, "route": route,
                "filename": filename, "category": category,
                "status": "error", "reason": str(exc)})

    stats["finished_at"] = datetime.utcnow().isoformat() + "Z"
    return stats


# ── Index generation ────────────────────────────────────────────────────────
def generate_index(stats: dict):
    pages_data = []
    for p in stats["pages"]:
        if p.get("status") != "success":
            continue
        md_path = OUT_DIR / p["filename"]
        text    = md_path.read_text(encoding="utf-8") if md_path.exists() else ""
        headings = [
            re.sub(r"^#{2,3}\s*", "", l).strip()
            for l in text.splitlines()
            if re.match(r"^#{2,3}\s+", l)
        ]
        words = len(re.sub(r"[#*`_\[\]|]", " ",
                           re.sub(r"^---.*?---", "", text, flags=re.DOTALL)).split())
        pages_data.append({
            "title":         p["title"],
            "route":         p["route"],
            "category":      p.get("category", ""),
            "filename":      p["filename"],
            "markdown_path": p.get("markdown_path", f"{DASHBOARD_FOLDER}/{p['filename']}"),
            "source_url":    p.get("source_url", f"{BASE_URL}{p['route']}"),
            "crawled_at":    p.get("crawled_at", ""),
            "summary":       p.get("summary", ""),
            "headings":      headings,
            "word_count":    words,
            "char_count":    p.get("char_count", 0),
            "auth_required": True,
            "status":        "indexed",
        })

    sitemap = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "base_url": BASE_URL,
        "auth_required": True,
        "total_pages": len(pages_data),
        "pages": [{"title": d["title"], "route": d["route"], "category": d["category"],
                   "markdown_path": d["markdown_path"], "summary": d["summary"]}
                  for d in pages_data],
    }

    (KB_ROOT / "dashboard_sitemap.json").write_text(
        json.dumps(sitemap, indent=2, ensure_ascii=False), encoding="utf-8")
    (KB_ROOT / "dashboard_pages.json").write_text(
        json.dumps(pages_data, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"  Sitemap: dashboard_sitemap.json")
    print(f"  Index  : dashboard_pages.json")


# ── Report generation ───────────────────────────────────────────────────────
def generate_report(stats: dict):
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    icon = {"success": "OK", "failed": "FAIL", "skipped": "SKIP",
            "inaccessible": "NO-AUTH", "error": "ERR"}

    lines = [
        "# OmniDimension Dashboard Crawl Report - Phase 2",
        "",
        f"> Generated: {now}",
        f"> Authentication: {stats.get('auth_status', 'unknown')}",
        "",
        "---",
        "## Crawl Statistics",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| Target | `{BASE_URL}` (authenticated) |",
        f"| Credentials | `{LOGIN_EMAIL}` |",
        f"| Total planned | {stats['total']} |",
        f"| Documented | {stats['success']} |",
        f"| Failed | {stats['failed']} |",
        f"| Skipped | {stats['skipped']} |",
        f"| Inaccessible | {stats['inaccessible']} |",
        f"| Started | {stats.get('started_at','N/A')} |",
        f"| Finished | {stats.get('finished_at','N/A')} |",
        "",
        "---",
        "## Pages",
        "",
        "| Status | Category | Title | Route | File |",
        "|--------|----------|-------|-------|------|",
    ]
    for p in stats["pages"]:
        lines.append(
            f"| {icon.get(p.get('status',''),'?')} "
            f"| {p.get('category','')} "
            f"| {p.get('title','')} "
            f"| `{p.get('route','')}` "
            f"| `{p.get('filename', p.get('reason',''))}` |"
        )

    lines += [
        "",
        "---",
        "## Recommendations",
        "",
        "1. **Seed test data** then re-run -- Analytics and Call Logs show richer content",
        "   when the account has real call history.",
        "2. **Agent detail pages** (`/agent/:id`) require an existing agent ID.",
        "   Create a test agent then add its route to `dashboard_crawl_config.py`.",
        "3. **Admin Panel** -- only shown when `user.role === 'Admin'`.",
        "   Confirm the test account has admin role in the database.",
        "4. **Billing tabs** -- Overview / History tabs may need explicit click JS.",
        "5. **WhaBridge** -- sidebar item has no route yet; skip until implemented.",
        "",
        "---",
        "_Generated by OmniDimension documentation pipeline -- Phase 2 (Authenticated)_",
    ]

    (KB_ROOT / "DASHBOARD_CRAWL_REPORT.md").write_text("\n".join(lines), encoding="utf-8")
    (REPORTS_DIR / "dashboard_crawl_stats.json").write_text(
        json.dumps(stats, indent=2, ensure_ascii=False), encoding="utf-8")
    print("  Report : DASHBOARD_CRAWL_REPORT.md")


# ── Main ────────────────────────────────────────────────────────────────────
async def main():
    print(f"\n{'='*60}")
    print(f"  OmniDimension Dashboard Crawler - Phase 2")
    print(f"  Target : {BASE_URL}")
    print(f"  Login  : {LOGIN_EMAIL}")
    print(f"  Pages  : {len(DASHBOARD_PAGES)}")
    print("=" * 60 + "\n")

    # Step 1 -- API login (fast, no browser)
    print("--- Phase A: API Authentication ---\n")
    ok, token, refresh = api_login()
    if not ok or not token:
        print("\nAuthentication failed. Check credentials and that the backend is running.\n")
        sys.exit(1)

    browser_cfg = BrowserConfig(
        browser_type="chromium",
        headless=True,
        verbose=False,
        extra_args=["--disable-web-security", "--no-sandbox", "--disable-gpu",
                    "--disable-blink-features=AutomationControlled"],
    )

    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        # Step 2 -- warm up browser session
        print("\n--- Phase B: Browser Session Warm-Up ---\n")
        session_ok = await warm_up_session(crawler, token, refresh)
        if not session_ok:
            print("\nBrowser session could not be authenticated. Aborting.\n")
            sys.exit(1)

        # Step 3 -- crawl all pages
        print("\n--- Phase C: Crawling Dashboard Pages ---\n")
        stats = await crawl_pages(crawler, token)

    # Step 4 -- generate outputs
    print("\n--- Phase D: Generating Index & Report ---\n")
    generate_index(stats)
    generate_report(stats)

    print(f"\n{'='*60}")
    print(f"  Dashboard crawl complete")
    print(f"  Success     : {stats['success']}")
    print(f"  Failed      : {stats['failed']}")
    print(f"  Skipped     : {stats['skipped']}")
    print(f"  Inaccessible: {stats['inaccessible']}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
