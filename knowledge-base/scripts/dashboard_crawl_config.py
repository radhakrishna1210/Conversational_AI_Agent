"""
Dashboard Crawl Configuration — Phase 2 (Authenticated)
=========================================================
All routes, selectors, and credentials for the dashboard crawler.
Keep credentials here; never commit to a public repo.
"""

BASE_URL = "http://localhost:5173"

# ── Login credentials ──────────────────────────────────────────────────────
LOGIN_EMAIL    = "admin@example.com"
LOGIN_PASSWORD = "admin123"
LOGIN_ROUTE    = "/login"

# ── Dashboard pages to crawl ───────────────────────────────────────────────
# (route, output_filename, page_title, category)
DASHBOARD_PAGES = [
    # Voice AI Setup
    ("/dashboard",              "dashboard.md",         "Voice AI Assistants (Dashboard)",  "Voice AI Setup"),
    ("/voice_assistant",        "voice_assistant.md",   "Real-time TTS",                    "Voice AI Setup"),
    ("/clone_voice",            "clone_voice.md",       "Clone Voice",                      "Voice AI Setup"),
    ("/files",                  "files.md",             "Files & Knowledge Base",           "Voice AI Setup"),
    ("/integrations",           "integrations.md",      "Integrations",                     "Voice AI Setup"),

    # Operations & Monitoring
    ("/phone_numbers",          "phone_numbers.md",     "Phone Numbers",                    "Operations"),
    ("/bulk_call/create",       "bulk_call.md",         "Bulk Call",                        "Operations"),
    ("/call_logs",              "call_logs.md",         "Call Logs",                        "Operations"),
    ("/analytics",              "analytics.md",         "Analytics",                        "Operations"),

    # Chat
    ("/whatsapp",               "whatsapp.md",          "WhatsApp",                         "Chat"),

    # Account & Billing
    ("/billing",                "billing.md",           "Billing",                          "Account"),
    ("/api_keys",               "api_keys.md",          "API Keys",                         "Account"),
    ("/settings",               "settings.md",          "Settings",                         "Account"),
    ("/profile",                "profile.md",           "Profile",                          "Account"),
    ("/admin",                  "admin_panel.md",       "Admin Panel",                      "Account"),

    # Other
    ("/notifications/archive",  "notifications.md",     "Notification Archive",             "Other"),
]

# ── Output folder (relative to knowledge-base root) ────────────────────────
DASHBOARD_FOLDER = "dashboard"

# ── Selectors to EXCLUDE from extracted content ────────────────────────────
EXCLUDED_SELECTORS = [
    # Sidebar chrome
    "aside",
    ".sidebar",
    "#layout-sidebar",
    ".sidebar-overlay",

    # Top bar chrome
    ".topbar-fixed",
    ".dashboard-topbar",
    ".topbar-search",
    ".topbar-actions",
    ".topbar-icon-btn",
    ".topbar-avatar",

    # Notification panel (slide-in overlay)
    "[data-notification-panel]",
    ".notification-panel",

    # Command menu (modal)
    "[cmdk-root]",
    "[data-radix-popper-content-wrapper]",

    # Ask Kevin chat widget (floating)
    ".kevin-chat-widget",
    ".ask-kevin-bubble",

    # Toast messages
    "[data-sonner-toaster]",
    ".toast",

    # Generic chrome
    "nav",
    "header",
    "footer",
    "script",
    "style",
    "noscript",
]

# ── Wait times ─────────────────────────────────────────────────────────────
LOGIN_WAIT_MS    = 4000   # wait after login submit before verifying
PAGE_WAIT_MS     = 3000   # wait after navigation for React hydration
API_SETTLE_MS    = 2000   # extra wait for API calls to settle

# ── Session ID ─────────────────────────────────────────────────────────────
# Reusing the same session ID keeps the browser context (and localStorage)
# alive across all crawl requests so the auth token persists.
SESSION_ID = "omni_auth_session"
