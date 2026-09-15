import { z } from 'zod';
import { CAMPAIGN_NAME_MAX_LENGTH } from '../constants/limits.js';

export const createCampaignSchema = z.object({
  name: z.string().min(2).max(CAMPAIGN_NAME_MAX_LENGTH),
  templateId: z.string().cuid(),
  whatsappNumberId: z.string().cuid(),
  variableMapping: z.record(z.string()).optional(),
});

export const scheduleCampaignSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
});

// Editable settings only. `status` and `progress` used to be accepted here, so a
// plain PUT could mark a campaign RUNNING with no dispatcher behind it, or
// COMPLETED with recipients never dialled. Status moves through start / pause /
// cancel / launch, and progress is derived from recipient rows.
export const updateCampaignSchema = z.object({
  name: z.string().min(2).max(CAMPAIGN_NAME_MAX_LENGTH).optional(),
  botId: z.string().optional(),
  fromNumber: z.string().optional(),
  concurrentCalls: z.number().int().min(1).optional(),
});

export const addRecipientsSchema = z.object({
  contactIds: z.array(z.string().min(1)).min(1).max(5000),
});

export const updateOptoutKeywordSchema = z.object({
  keyword: z.string().min(1).max(20),
});
