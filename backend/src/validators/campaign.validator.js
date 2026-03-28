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

export const updateOptoutKeywordSchema = z.object({
  keyword: z.string().min(1).max(20),
});
