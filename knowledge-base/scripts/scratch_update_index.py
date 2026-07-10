"""One-off: add api_keys.md to dashboard_pages.json and dashboard_sitemap.json."""
import json, re
from pathlib import Path
from datetime import datetime

KB_ROOT  = Path(__file__).parent.parent.resolve()
OUT_DIR  = KB_ROOT / "dashboard"
BASE_URL = "http://localhost:5173"

# Load existing pages.json
pages = json.loads((KB_ROOT / "dashboard_pages.json").read_text(encoding="utf-8"))

# Build new api_keys entry
md_path = OUT_DIR / "api_keys.md"
text    = md_path.read_text(encoding="utf-8")
headings = [re.sub(r"^#{2,3}\s*","",l).strip() for l in text.splitlines()
            if re.match(r"^#{2,3}\s+",l)]
words = len(re.sub(r"[#*`_\[\]|]"," ",
                   re.sub(r"^---.*?---","",text,flags=re.DOTALL)).split())
entry = {
    "title": "API Keys", "route": "/api_keys", "category": "Account",
    "filename": "api_keys.md", "markdown_path": "dashboard/api_keys.md",
    "source_url": BASE_URL + "/api_keys",
    "crawled_at": datetime.utcnow().isoformat() + "Z",
    "summary": "Generate and manage API credentials for programmatic access to the OmniDimension platform.",
    "headings": headings, "word_count": words, "char_count": len(text),
    "auth_required": True, "status": "indexed",
    "note": "Statically authored (page was empty at crawl time)",
}

# Remove old api_keys entry if present
pages = [p for p in pages if p.get("route") != "/api_keys"]
pages.append(entry)
pages.sort(key=lambda x: (x.get("category",""), x.get("title","")))

(KB_ROOT / "dashboard_pages.json").write_text(
    json.dumps(pages, indent=2, ensure_ascii=False), encoding="utf-8")

# Update sitemap
sitemap = json.loads((KB_ROOT / "dashboard_sitemap.json").read_text(encoding="utf-8"))
sitemap["pages"] = [p for p in sitemap["pages"] if p.get("route") != "/api_keys"]
sitemap["pages"].append({
    "title": entry["title"], "route": entry["route"], "category": entry["category"],
    "markdown_path": entry["markdown_path"], "summary": entry["summary"],
})
sitemap["total_pages"] = len(sitemap["pages"])
(KB_ROOT / "dashboard_sitemap.json").write_text(
    json.dumps(sitemap, indent=2, ensure_ascii=False), encoding="utf-8")

print("dashboard_pages.json:   " + str(len(pages)) + " pages")
print("dashboard_sitemap.json: " + str(sitemap["total_pages"]) + " pages")
