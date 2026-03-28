import { z } from 'zod';
import { AUTOMATION_REPLY_MAX_LENGTH } from '../constants/limits.js';

export const keywordTriggerSchema = z.object({
  keyword: z.string().min(1).max(50).toUpperCase(),
  replyText: z.string().min(1).max(AUTOMATION_REPLY_MAX_LENGTH),
  isActive: z.boolean().default(true),
  matchExact: z.boolean().default(false),
});

export const flowSchema = z.object({
  flowJson: z.record(z.unknown()),
});
