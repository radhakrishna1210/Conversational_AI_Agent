import { z } from 'zod';
import { CAMPAIGN_NAME_MAX_LENGTH } from '../constants/limits.js';
import { CAMPAIGN_STATUS } from '../constants/campaignStatus.js';

export const createCampaignSchema = z.object({
  name: z.string().min(2).max(CAMPAIGN_NAME_MAX_LENGTH),
  templateId: z.string().cuid(),
  whatsappNumberId: z.string().cuid(),
  variableMapping: z.record(z.string()).optional(),
});

export const scheduleCampaignSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
});

export const updateCampaignSchema = z.object({
  name: z.string().min(2).max(CAMPAIGN_NAME_MAX_LENGTH).optional(),
  botId: z.string().optional(),
  fromNumber: z.string().optional(),
  concurrentCalls: z.number().int().min(1).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  status: z.enum([
    CAMPAIGN_STATUS.DRAFT,
    CAMPAIGN_STATUS.SCHEDULED,
    CAMPAIGN_STATUS.RUNNING,
    CAMPAIGN_STATUS.COMPLETED,
    CAMPAIGN_STATUS.CANCELLED,
    CAMPAIGN_STATUS.FAILED,
  ]).optional(),
});

export const updateOptoutKeywordSchema = z.object({
  keyword: z.string().min(1).max(20),
});
