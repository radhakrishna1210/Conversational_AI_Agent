# OmniDimension Knowledge Base

Auto-generated documentation for the OmniDimension Conversational Voice AI platform.
Produced by the Crawl4AI-based documentation pipeline.

> **Status**: Generated from live React/Vite frontend at `http://localhost:5173`
> **Purpose**: Senior review + future RAG (Retrieval-Augmented Generation) ingestion

---

## Folder Structure

```
knowledge-base/
├── Home/                        # Landing page content
├── Pricing/                     # Plans, FAQ, pricing tables
├── Documentation/               # SDK documentation overview
├── Contact/                     # Contact form page
├── BookAppointment/             # Booking page
├── ReportIssue/                 # Issue reporting page
├── Integrations/
│   ├── CalCom/                  # Cal.com integration
│   ├── Salesforce/              # Salesforce CRM integration
│   ├── CustomAPI/               # Custom API integration
│   └── SIPTrunking/             # SIP trunking / Vonage
├── Solutions/
│   ├── Finance/
│   ├── Education/
│   ├── Ecommerce/
│   ├── RealEstate/
│   ├── Insurance/
│   ├── Healthcare/
│   ├── Restaurants/
│   ├── LeadGeneration/
│   ├── Collections/
│   ├── Negotiation/
│   ├── CustomerSupport/
│   └── Appointments/
├── sitemap.json                 # Machine-readable sitemap
├── pages.json                   # Full page manifest with summaries
├── CRAWL_REPORT.md              # Detailed crawl report for review
└── scripts/                     # Pipeline source (do not ingest)
```

---

## Running the Pipeline

### Prerequisites

```bash
# 1. Install crawl4ai
pip install crawl4ai

# 2. Install browser (one-time)
crawl4ai-setup

# 3. Start the Vite dev server
cd client
npm run dev
```

### Run the full pipeline

```bash
# From project root
python knowledge-base/scripts/run_pipeline.py
```

### Run individual phases

```bash
python knowledge-base/scripts/crawler.py          # Phase 2 — Crawl
python knowledge-base/scripts/cleanup.py          # Phase 3 — Cleanup
python knowledge-base/scripts/generate_index.py   # Phase 4 — Index
python knowledge-base/scripts/generate_report.py  # Phase 5 — Report
```

---

## Output Files

| File | Description |
|------|-------------|
| `*/**.md` | One Markdown file per page with YAML front-matter |
| `sitemap.json` | Lightweight sitemap: title, route, markdown path, summary |
| `pages.json` | Rich manifest: word count, headings, char count, crawl timestamp |
| `CRAWL_REPORT.md` | Human-readable summary for senior review |

---

## Pages NOT Crawled (Auth-gated)

These pages require a logged-in session and cannot be crawled automatically.
They should be manually documented before RAG ingestion:

- `/dashboard` — agent management dashboard
- `/agent/:id` — per-agent configuration
- `/admin` — admin panel
- `/billing` — subscription management
- `/analytics` — call analytics
- `/integrations` (dashboard) — live OAuth-connected integrations

---

## Notes for RAG Ingestion

- Each `.md` file has a YAML front-matter block with `title`, `route`, `source`, and `crawled_at`
- `pages.json` is the recommended ingestion manifest
- The `scripts/` folder itself should be **excluded** from the vector store
- Re-run the pipeline after significant UI changes to keep the knowledge base fresh
