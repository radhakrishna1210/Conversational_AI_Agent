import { z } from 'zod';

export const integrationProviderParamSchema = z.object({
  provider: z.string().min(2),
});

export const integrationConnectSchema = z.object({
  redirectUri: z.string().url().optional(),
});

export const integrationSettingsSchema = z.object({
  settings: z.record(z.any()).default({}),
});

export const integrationCustomApiSchema = z.object({
  name: z.string().min(2).max(120),
  endpointUrl: z.string().url(),
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
