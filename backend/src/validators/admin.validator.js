import { z } from 'zod';

export const addNumberToPoolSchema = z.object({
  phoneNumber:   z.string().min(10).max(15),
  phoneNumberId: z.string().min(1),
  wabaId:        z.string().min(1),
  accessToken:   z.string().min(1),
  displayName:   z.string().optional(),
});
