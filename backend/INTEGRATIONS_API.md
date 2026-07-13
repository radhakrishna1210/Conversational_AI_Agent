# Integrations API

This backend exposes a workspace-scoped integrations system for Cal.com, Calendly, Custom API, Salesforce, Google Calendar, Google Sheets, Slack, HubSpot, and Genesys.

## Core endpoints

All authenticated endpoints live under:

`/api/v1/workspaces/:workspaceId/integrations`

Available routes:

- `GET /` - integration dashboard with status, stats, logs, and sync metadata
- `GET /logs` - integration activity logs
- `GET /:provider` - fetch a single integration record
- `POST /:provider/connect` - start OAuth connect flow
- `POST /:provider/disconnect` - disconnect and revoke token usage
- `PATCH /:provider/settings` - save integration settings
- `POST /:provider/sync` - queue and run a sync job
- `POST /custom-api/test` - test a custom REST API configuration
- `GET /events` - SSE stream for live integration updates

## OAuth callback endpoints

Public callback routes are handled here:

- `GET /api/v1/integrations/cal/callback`
- `GET /api/v1/integrations/calendly/callback`
- `GET /api/v1/integrations/salesforce/callback`
- `GET /api/v1/integrations/google_calendar/callback`
- `GET /api/v1/integrations/google_sheets/callback`
- `GET /api/v1/integrations/slack/callback`
- `GET /api/v1/integrations/hubspot/callback`
- `GET /api/v1/integrations/genesys/callback`

The backend exchanges the authorization code, stores encrypted tokens, writes activity logs, and redirects back to the integrations UI.

## Webhooks

The public webhook entrypoint is:

- `POST /api/v1/integrations/webhooks/:provider`

Events are persisted to `webhookEvents` and can trigger follow-up sync jobs.

## Data model

The integrations system stores data in these Prisma models:

- `Integration`
- `IntegrationToken`
- `IntegrationLog`
- `OAuthSession`
- `WebhookEvent`
- `SyncJob`
- `IntegrationSetting`
- `CustomApiConfig`

## Security

- Tokens are encrypted before storage.
- OAuth state is stored server-side and marked consumed after callback.
- Workspace membership is enforced for authenticated routes.
- Redis-backed rate limiting and job processing are used when Redis is available.
- Webhook payloads are stored for auditability.

## Local setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL=file:./dev.db` for local SQLite development.
3. Set `ENCRYPTION_KEY` to a 32-character value.
4. Configure OAuth client IDs, secrets, and callback URLs for the providers you need.
5. Run Prisma validation or migrations from `backend/`.
6. Start the backend and frontend dev servers.
