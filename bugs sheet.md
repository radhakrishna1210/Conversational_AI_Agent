# Bugs Sheet

Sorted from lower impact to higher impact.

## 1. Duplicate navigation entry points to the same page
- Type: UI / navigation bug
- Impact: Low
- Files: [client/src/components/DashboardLayout.tsx](client/src/components/DashboardLayout.tsx#L280), [client/src/components/DashboardLayout.tsx](client/src/components/DashboardLayout.tsx#L287)
- Problem: The sidebar shows both `WhatsApp` and `WhaBridge`, but both links go to `/whatsapp`.
- Why it matters: Users see two separate menu items that do not lead to separate destinations, which is confusing and makes the sidebar look broken or unfinished.

## 2. Bulk Call page can stay empty if `workspaceId` is missing in localStorage
- Type: Functional / logical bug
- Impact: Medium
- Files: [client/src/pages/BulkCall.tsx](client/src/pages/BulkCall.tsx#L48)
- Problem: The page returns early when `workspaceId` is empty, instead of letting the shared auth logic recover it from the token the way `whapi` does.
- Why it matters: A signed-in user can land on a blank or partially loaded Bulk Call page until localStorage is repaired or the app is refreshed.

## 3. Integrations live updates do not attach unless `workspaceId` already exists at mount time
- Type: Functional bug
- Impact: Medium
- Files: [client/src/pages/Integrations.tsx](client/src/pages/Integrations.tsx#L510)
- Problem: The SSE subscription reads `workspaceId` directly from localStorage once on mount and bails out if it is missing.
- Why it matters: Users can still load the page through the normal API path, but they miss real-time integration updates until they refresh after `workspaceId` is cached.

## 4. Login can succeed in sessionStorage, but the rest of the app reads only localStorage
- Type: Functional / auth-flow bug
- Impact: Medium
- Files: [client/src/pages/Login.tsx](client/src/pages/Login.tsx#L43), [client/src/pages/Login.tsx](client/src/pages/Login.tsx#L53), [client/src/components/Navbar.tsx](client/src/components/Navbar.tsx#L31), [client/src/components/DashboardLayout.tsx](client/src/components/DashboardLayout.tsx#L112)
- Problem: The login flow falls back to `sessionStorage` when `localStorage` is blocked, but the navbar and dashboard still check only `localStorage` for the token and workspace context.
- Why it matters: Private/incognito users can authenticate and then look logged out or lose workspace state because different parts of the app read different storage locations.

## 5. Notification stream exposes the bearer token in the URL
- Type: Security / operational bug
- Impact: Medium to High
- Files: [client/src/lib/notificationsApi.ts](client/src/lib/notificationsApi.ts#L107)
- Problem: The notification stream URL appends `token=...` as a query parameter.
- Why it matters: Query-string tokens can leak through logs, browser history, proxies, and error reporting. This is a safer place to move to headers or a cookie-based auth path.

## 6. Query-string token fallback is accepted by the shared auth middleware for all workspace routes
- Type: Security / operational bug
- Impact: Medium to High
- Files: [backend/src/middleware/authenticate.js](backend/src/middleware/authenticate.js#L11-L13)
- Problem: The shared auth middleware accepts `req.query.token` whenever a bearer header is missing, not just for the SSE path that actually needs it.
- Why it matters: Bearer tokens in URLs are easier to leak through logs, redirects, browser history, and proxies, and this makes that risk apply to every authenticated workspace route.

## 7. JWT workspace recovery uses raw `atob` on a base64url token segment
- Type: Functional / logical bug
- Impact: High
- Files: [client/src/lib/whapi.ts](client/src/lib/whapi.ts#L21), [client/src/lib/notificationsApi.ts](client/src/lib/notificationsApi.ts#L11), [client/src/components/DashboardLayout.tsx](client/src/components/DashboardLayout.tsx#L126)
- Problem: The code decodes `token.split('.')[1]` with `atob`, but JWT payload segments are base64url encoded, not plain base64.
- Why it matters: Workspace recovery from the token can fail silently, which cascades into missing API context, missing user data, and failed notification or layout initialization.

## 8. Notification read and delete mutations use an invalid Prisma selector
- Type: Functional / backend bug
- Impact: High
- Files: [backend/src/controllers/notification.controller.js](backend/src/controllers/notification.controller.js#L53), [backend/src/controllers/notification.controller.js](backend/src/controllers/notification.controller.js#L89), [backend/prisma/schema.prisma](backend/prisma/schema.prisma#L607-L621)
- Problem: The controller calls `prisma.notification.update({ where: { id, workspaceId } })` and `delete({ where: { id, workspaceId } })`, but the model only defines `id` as the unique selector.
- Why it matters: Those endpoints can fail at runtime instead of safely updating or deleting a notification within the current workspace.

## 9. LLM generation ignores agent-specific configuration
- Type: Functional bug
- Impact: High
- Files: [backend/src/controllers/llm.controller.js](backend/src/controllers/llm.controller.js#L55)
- Problem: The controller still uses request/environment defaults and has a `TODO` instead of loading provider/model/temperature from the agent record.
- Why it matters: `agentId` is effectively not driving the response configuration yet, so different agents can produce the same LLM behavior even when they should not.

## 10. Public LLM prompt endpoints can be abused without auth
- Type: Security / abuse bug
- Impact: High
- Files: [backend/src/routes/index.js](backend/src/routes/index.js#L90-L91), [backend/src/controllers/llm.controller.js](backend/src/controllers/llm.controller.js#L279-L299)
- Problem: `/llm/generate-flow` and `/llm/enhance-prompt` are mounted as public routes and invoke real model work without authentication or rate limiting.
- Why it matters: These endpoints can be used for unauthenticated compute abuse and quota burn.

## 11. Agent CRUD and test-call routes are mounted publicly
- Type: Security bug
- Impact: High
- Files: [backend/src/routes/index.js](backend/src/routes/index.js#L52), [backend/src/routes/agent.routes.js](backend/src/routes/agent.routes.js#L1-L12)
- Problem: The agent router is exposed before the workspace auth middleware, so create, read, update, delete, chat, voice assignment, and test-call routes are reachable without auth.
- Why it matters: Anyone who can reach the API can manipulate agent data or trigger agent actions.

## 12. Voice management routes are also public
- Type: Security bug
- Impact: High
- Files: [backend/src/routes/index.js](backend/src/routes/index.js#L53), [backend/src/routes/voice.routes.js](backend/src/routes/voice.routes.js#L1-L15)
- Problem: Voice listing, detail, sync, and preview routes are mounted publicly instead of behind workspace authentication.
- Why it matters: Voice configuration and sync operations can be invoked without a valid workspace session.

## 13. Knowledge base document storage is still a broad implementation gap
- Type: Product / implementation gap
- Impact: Medium
- Files: [client/src/pages/EditAgent.tsx](client/src/pages/EditAgent.tsx#L1846), [client/src/pages/Dashboard.tsx](client/src/pages/Dashboard.tsx#L1529)
- Problem: The UI exposes knowledge-base file/url inputs and KB counters, but the reviewed backend surface does not show a dedicated knowledge-base document store or retrieval flow.
- Why it matters: Users can see knowledge-base features in the editor and dashboard, but the end-to-end document storage and retrieval path still needs clear backend ownership.

## 14. Real-time TTS is still wired as an active feature path
- Type: Product / implementation gap
- Impact: Medium
- Files: [client/src/components/DashboardLayout.tsx](client/src/components/DashboardLayout.tsx#L218), [client/src/services/ttsSocket.ts](client/src/services/ttsSocket.ts#L1-L18)
- Problem: The app still advertises Real-time TTS in the sidebar and maintains a live WebSocket client for streaming speech.
- Why it matters: If the intent is to remove real-time TTS, the feature is still visible and technically active, so it needs an explicit removal pass rather than a cosmetic change.

## 15. Bulk call and phone call UI still need role-specific polish
- Type: UI / product gap
- Impact: Medium
- Files: [client/src/pages/BulkCall.tsx](client/src/pages/BulkCall.tsx#L1-L20), [client/src/pages/BulkCall.tsx](client/src/pages/BulkCall.tsx#L146-L220), [client/src/pages/AdminPanel.tsx](client/src/pages/AdminPanel.tsx#L1285-L1310)
- Problem: The member/admin bulk-call and phone-call surfaces are functional, but the layouts, states, and action hierarchy still need cleanup to feel settled.
- Why it matters: These core operational screens are high-frequency workflows, so rough UI or unclear controls directly slow users down.

## 16. Admin panel exposure still needs a clearer client-side boundary
- Type: Security / product boundary issue
- Impact: High
- Files: [client/src/components/DashboardLayout.tsx](client/src/components/DashboardLayout.tsx#L323-L328), [client/src/App.tsx](client/src/App.tsx#L189)
- Problem: The admin panel is surfaced in the client application and routed there, even though the sidebar only hides it based on the current role.
- Why it matters: The UI boundary is role-based, but the route still exists in the public client bundle, so the admin surface needs to be treated carefully and consistently on both UI and API sides.

## 17. Integrations tab still needs stabilization and cleanup
- Type: UI / functional product gap
- Impact: Medium
- Files: [client/src/pages/Integrations.tsx](client/src/pages/Integrations.tsx#L1-L20), [client/src/pages/Integrations.tsx](client/src/pages/Integrations.tsx#L488-L512)
- Problem: The integrations page is heavily stateful and still depends on multiple fallback paths for loading, callbacks, SSE refresh, and provider-specific forms.
- Why it matters: This is one of the most complex settings screens, so it needs consistent state handling and calmer UX before it feels settled.

## 18. Clone Voice is still a placeholder implementation
- Type: Pending implementation
- Impact: Medium
- Files: [client/src/pages/CloneVoice.tsx](client/src/pages/CloneVoice.tsx#L1-L40), [client/src/pages/CloneVoice.tsx](client/src/pages/CloneVoice.tsx#L140-L160)
- Problem: The page presents form sections and a submit button, but the reviewed file does not show the actual recording/upload submission workflow being implemented.
- Why it matters: Users can reach the Clone Voice screen, but the core voice-cloning action still appears unfinished.
