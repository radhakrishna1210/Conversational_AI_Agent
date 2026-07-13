import { z } from 'zod';
import { MESSAGE_BODY_MAX_LENGTH, MEDIA_CAPTION_MAX_LENGTH } from '../constants/limits.js';

export const assignAgentSchema = z.object({
  agentId: z.string().cuid().nullable(),
});

export const sendMessageSchema = z.object({
  type: z.enum(['TEXT', 'TEMPLATE', 'IMAGE', 'DOCUMENT']).default('TEXT'),
  body: z.string().max(MESSAGE_BODY_MAX_LENGTH).optional(),
  mediaUrl: z.string().url().optional(),
  mediaCaption: z.string().max(MEDIA_CAPTION_MAX_LENGTH).optional(),
  templateId: z.string().cuid().optional(),
  templateVars: z.record(z.string()).optional(),
});

export const updateConvSchema = z.object({
  status: z.enum(['OPEN', 'RESOLVED', 'PENDING']).optional(),
  label: z.string().max(30).nullable().optional(),
  botEnabled: z.boolean().optional(),
});
