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

/**
 * The carrier's `end_user` facts. Every field optional so the form can be saved
 * half-finished — plivo/compliance.service.js#preflight is what decides whether
 * it is complete enough to file, and it reports every gap at once rather than
 * one field at a time.
 *
 * No shape check on registrationNumber: CINs, LLPINs and Udyam numbers all live
 * in that field and their formats differ. See setEntityDetails().
 */
export const setEntityDetailsSchema = z.object({
  registrationNumber: z.string().max(64).nullish(),
  contactEmail: z.string().max(254).nullish(),
  address: z.object({
    addressLine1: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
    country: z.string().length(2).optional(),
  }).nullish(),
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

/**
 * Renting picks one number out of live carrier inventory, so the only input is
 * which one. Everything else — series, subaccount, compliance application — is
 * derived from the workspace's own record, never accepted from the caller: a
 * client-supplied series would let a promotional workspace record a landline as
 * a 140 and dial straight through the TCCCPR gate.
 */
export const rentNumberSchema = z.object({
  phoneNumber: z.string().regex(/^\+91\d{10,}$/, 'Indian E.164 number, e.g. +911402345678'),
});

export const headerStatusSchema = z.object({
  status: enumOf(HEADER_STATUS),
  rejectionReason: z.string().max(500).optional(),
});
