import { z } from 'zod';
import { TEMPLATE_BODY_MAX_LENGTH, TEMPLATE_HEADER_MAX_LENGTH } from '../constants/limits.js';

export const createTemplateSchema = z.object({
  name: z.string().min(2).max(100).regex(/^[a-z0-9_]+$/, 'Only lowercase letters, numbers, and underscores'),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  language: z.string().default('en'),
  bodyText: z.string().min(1).max(TEMPLATE_BODY_MAX_LENGTH),
  headerText: z.string().max(TEMPLATE_HEADER_MAX_LENGTH).optional(),
  footerText: z.string().max(TEMPLATE_HEADER_MAX_LENGTH).optional(),
  buttons: z.array(z.object({
    type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
    text: z.string(),
    url: z.string().optional(),
    phone_number: z.string().optional(),
  })).optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();
