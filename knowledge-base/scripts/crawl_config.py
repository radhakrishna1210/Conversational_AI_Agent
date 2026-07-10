"""
OmniDimension Documentation Crawl Configuration
================================================
Central config for all crawl pipeline scripts.
Edit this file to add/remove pages or adjust selectors.
"""

BASE_URL = "http://localhost:5173"

# ---------------------------------------------------------------------------
# Page manifest
# Each entry: (route, output_folder, filename, title)
# ---------------------------------------------------------------------------
PAGES = [
    # ── Core public pages ──────────────────────────────────────────────────
    ("/",                                     "Home",                          "home.md",                "Home"),
    ("/pricing",                              "Pricing",                       "pricing.md",             "Pricing"),
    ("/documentation",                        "Documentation",                 "documentation.md",       "Documentation"),
    ("/docs",                                 "Documentation",                 "docs.md",                "Docs"),
    ("/contact",                              "Contact",                       "contact.md",             "Contact Us"),
    ("/book-appointment",                     "BookAppointment",               "book_appointment.md",    "Book an Appointment"),
    ("/report-issue",                         "ReportIssue",                   "report_issue.md",        "Report an Issue"),

    # ── Integrations ───────────────────────────────────────────────────────
    ("/integrations/cal-com",                 "Integrations/CalCom",           "cal_com.md",             "Cal.com Integration"),
    ("/integrations/salesforce",              "Integrations/Salesforce",       "salesforce.md",          "Salesforce Integration"),
    ("/integrations/custom-api",              "Integrations/CustomAPI",        "custom_api.md",          "Custom API Integration"),
    ("/integrations/SIPTrunking",             "Integrations/SIPTrunking",      "sip_trunking.md",        "SIP Trunking Integration"),

    # ── Solution Verticals ─────────────────────────────────────────────────
    ("/solutions/verticals/finance",          "Solutions/Finance",             "finance.md",             "Finance Solutions"),
    ("/solutions/verticals/education",        "Solutions/Education",           "education.md",           "Education Solutions"),
    ("/solutions/verticals/ecommerce",        "Solutions/Ecommerce",           "ecommerce.md",           "E-Commerce Solutions"),
    ("/solutions/verticals/real-estate",      "Solutions/RealEstate",          "real_estate.md",         "Real Estate Solutions"),
    ("/solutions/verticals/insurance",        "Solutions/Insurance",           "insurance.md",           "Insurance Solutions"),
    ("/solutions/verticals/healthcare",       "Solutions/Healthcare",          "healthcare.md",          "Healthcare Solutions"),
    ("/solutions/verticals/restaurants",      "Solutions/Restaurants",         "restaurants.md",         "Restaurants Solutions"),

    # ── Solution Use Cases ─────────────────────────────────────────────────
    ("/solutions/use-cases/lead-generation",  "Solutions/LeadGeneration",      "lead_generation.md",     "Lead Generation"),
    ("/solutions/use-cases/collections",      "Solutions/Collections",         "collections.md",         "Collections"),
    ("/solutions/use-cases/negotiation",      "Solutions/Negotiation",         "negotiation.md",         "Negotiation"),
    ("/solutions/use-cases/customer-support", "Solutions/CustomerSupport",     "customer_support.md",    "Customer Support"),
    ("/solutions/use-cases/appointments",     "Solutions/Appointments",        "appointments.md",        "Appointments"),
]

# ---------------------------------------------------------------------------
# CSS selectors to EXCLUDE from extracted content
# These match nav, footer, banners, and decorative chrome
# ---------------------------------------------------------------------------
EXCLUDED_SELECTORS = [
    "nav",
    "header",
    "footer",
    ".navbar",
    ".nav",
    ".footer",
    ".announcement-bar",
    ".announcement",
    ".cookie-banner",
    ".toast",
    ".modal",
    "[data-radix-popper-content-wrapper]",
    ".ask-kevin-bubble",      # floating chat bubble
    ".kevin-chat-widget",     # Kevin popup
    "script",
    "style",
    "noscript",
    # Pricing tab buttons (UI chrome, not content)
    ".pricing-tabs",
    ".pricing-tab",
    # Breadcrumb nav
    ".breadcrumb",
]

# ---------------------------------------------------------------------------
# Wait strategy: ms to wait after page load for React hydration
# ---------------------------------------------------------------------------
WAIT_FOR_MS = 2500          # 2.5 s initial hydration wait
EXTRA_SCROLL_WAIT_MS = 800  # extra wait after scrolling (lazy images)

# ---------------------------------------------------------------------------
# Output root (relative to this script's parent directory)
# ---------------------------------------------------------------------------
OUTPUT_ROOT = "../"          # knowledge-base/ is one level above scripts/
