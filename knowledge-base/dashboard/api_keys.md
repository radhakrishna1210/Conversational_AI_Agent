---
title: "API Keys"
route: "/api_keys"
category: "Account"
source: "http://localhost:5173/api_keys"
auth_required: true
crawled_at: "2026-07-10T05:00:00.000000Z"
note: "Page was empty at crawl time (no keys created yet). Content sourced from static analysis."
---

# API Keys

The API Keys page lets you generate and manage API credentials for programmatic access to the OmniDimension platform.

## Overview

Use API Keys to authenticate server-side requests to the OmniDimension REST API. Each key is scoped to your workspace and carries your workspace's permissions.

## Creating an API Key

1. Click **Create New Key** (or **+ Add Key**) on the API Keys page.
2. Enter a descriptive **name** for the key (e.g. `production-server`, `dev-testing`).
3. Click **Generate** — the key is shown **once**; copy it immediately.
4. Store it securely (environment variable, secrets manager). It will not be displayed again.

## Using Your API Key

Include the key in the `Authorization` header of every API request:

```
Authorization: Bearer <your-api-key>
```

Example (curl):

```bash
curl -X GET https://api.omnidimension.ai/v1/agents \
  -H "Authorization: Bearer sk-..."
```

## Key Management

| Action | Description |
|--------|-------------|
| **View** | See key name, creation date, and last-used timestamp |
| **Revoke** | Permanently invalidate a key — cannot be undone |
| **Rename** | Update the display name without changing the key value |

## Security Best Practices

- Never commit API keys to version control.
- Rotate keys regularly and immediately if compromised.
- Use one key per environment (development, staging, production).
- Revoke unused keys to reduce your attack surface.

## Rate Limits

Rate limits are enforced at the workspace level across all API keys. See the Billing page for your current plan's API limits.
