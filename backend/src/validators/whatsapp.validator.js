import { z } from 'zod';
import {
  PHONE_NUMBER_MIN_LENGTH,
  PHONE_NUMBER_MAX_LENGTH,
  OTP_LENGTH,
  WHATSAPP_DISPLAY_NAME_MAX_LENGTH,
  WHATSAPP_DESCRIPTION_MAX_LENGTH,
} from '../constants/limits.js';

export const registerNumberSchema = z.object({
  phoneNumber: z.string().min(PHONE_NUMBER_MIN_LENGTH).max(PHONE_NUMBER_MAX_LENGTH),
  countryCode: z.string().min(1).max(5).optional(),
});

export const verifyOtpSchema = z.object({
  phoneNumber: z.string().min(PHONE_NUMBER_MIN_LENGTH),
  otp: z.string().length(OTP_LENGTH),
});

export const connectOwnNumberSchema = z.object({
  phoneNumber:       z.string().min(7).max(20),
  metaPhoneNumberId: z.string().min(1),
  wabaId:            z.string().min(1),
  accessToken:       z.string().min(10),
  displayName:       z.string().min(1).max(WHATSAPP_DISPLAY_NAME_MAX_LENGTH).optional(),
});

export const businessProfileSchema = z.object({
  displayName: z.string().min(2).max(WHATSAPP_DISPLAY_NAME_MAX_LENGTH),
  category: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  description: z.string().max(WHATSAPP_DESCRIPTION_MAX_LENGTH).optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
});
