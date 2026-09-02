import { z } from 'zod';
import { assertPublicHttpUrlSync } from '../lib/safeUrl.js';

// A URL this server will call on the tenant's behalf. Refuse local/private
// targets at save time so the form says so; the fetch site re-checks after
// DNS resolution (lib/safeUrl.js).
const publicHttpUrl = (msg) => z.string().url().refine((v) => {
  try { assertPublicHttpUrlSync(v); return true; } catch { return false; }
}, { message: msg });

export const integrationProviderParamSchema = z.object({
  provider: z.string().min(2),
  workspaceId: z.string().optional(),
});

export const integrationConnectSchema = z.object({
  redirectUri: z.string().url().optional(),
});

export const integrationSettingsSchema = z.object({
  settings: z.record(z.any()).default({}),
});

export const integrationCustomApiSchema = z.object({
  name: z.string().min(2).max(120),
  endpointUrl: publicHttpUrl('Endpoint URL must be a public http(s) address'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
  authType: z.enum(['none', 'bearer', 'api_key']).default('none'),
  authValue: z.string().optional(),
  headers: z.record(z.string()).default({}),
  queryParams: z.record(z.string()).default({}),
  bodyTemplate: z.string().optional(),
});

export const integrationWebhookSchema = z.object({
  eventType: z.string().min(1),
  providerEventId: z.string().optional(),
  payload: z.any(),
});
