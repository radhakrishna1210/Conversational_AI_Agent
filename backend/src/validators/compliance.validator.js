import { z } from 'zod';
import {
  DOCUMENT_KIND,
  HEADER_STATUS,
  NUMBER_SERIES,
  PE_ID_LENGTH,
  TELEPHONY_PROVIDER,
  TEMPLATE_STATUS,
  USE_CASE,
} from '../constants/compliance.js';

const enumOf = (obj) => z.enum(Object.values(obj));

export const setUseCaseSchema = z.object({
  useCase: enumOf(USE_CASE).optional(),
  entityName: z.string().min(2).max(200).optional(),
  legalEntityType: z.string().min(2).max(100).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });

export const setPeIdSchema = z.object({
  // Length is checked here for a fast, field-level error; parsePeId() still runs
  // in the service and owns the operator-prefix logic.
  peId: z.string().min(PE_ID_LENGTH).max(PE_ID_LENGTH + 6),
});

export const documentMetaSchema = z.object({
  kind: enumOf(DOCUMENT_KIND),
});

export const saveTemplateSchema = z.object({
  id: z.string().cuid().optional(),
  name: z.string().min(2).max(200),
  body: z.string().min(10).max(5000),
  dltTemplateId: z.string().min(3).max(64).optional(),
  status: enumOf(TEMPLATE_STATUS).optional(),
});

export const assignNumberSchema = z.object({
  phoneNumber: z.string().regex(/^\+91\d{10,}$/, 'Indian E.164 number, e.g. +911402345678'),
  provider: enumOf(TELEPHONY_PROVIDER).optional(),
  providerNumberId: z.string().max(128).optional(),
  subaccountId: z.string().max(128).optional(),
  series: enumOf(NUMBER_SERIES).optional(),
  dailyDialCap: z.number().int().min(1).max(5000).optional(),
});

export const headerStatusSchema = z.object({
  status: enumOf(HEADER_STATUS),
  rejectionReason: z.string().max(500).optional(),
});
