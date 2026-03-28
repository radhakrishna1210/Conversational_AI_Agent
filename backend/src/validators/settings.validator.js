import { z } from 'zod';

export const webhookConfigSchema = z.object({
  url: z.string().url(),
  subscribedEvents: z.array(z.string()).min(1),
});

export const notificationPrefsSchema = z.object({
  notifyOnNewConv: z.boolean().optional(),
  notifyOnOptOut: z.boolean().optional(),
  notifyOnCampaignEnd: z.boolean().optional(),
  notifyOnHighOptOut: z.boolean().optional(),
  notifyOnRateLimit: z.boolean().optional(),
});

export const workspaceUpdateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  timezone: z.string().optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['Admin', 'Agent', 'Viewer']).default('Agent'),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['Admin', 'Agent', 'Viewer']),
});
