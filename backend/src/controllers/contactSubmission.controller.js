import { z } from 'zod';
import { createContactSubmission } from '../services/contactSubmission.service.js';
import logger from '../lib/logger.js';

const contactSubmissionSchema = z.object({
  name: z.string().trim().min(2, 'name must be at least 2 characters'),
  email: z.string().trim().email('email must be valid'),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s().-]{7,19}$/, 'phone must be valid'),
  monthlyCallVolume: z.string().trim().min(1, 'monthlyCallVolume is required'),
  helpTopic: z.string().trim().min(1, 'helpTopic is required'),
  useCase: z.string().trim().min(10, 'useCase must be at least 10 characters'),
  referralSource: z.string().trim().max(120).optional().or(z.literal('')),
});

export const submitContactRequest = async (req, res) => {
  const parsed = contactSubmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid contact submission',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const submission = await createContactSubmission(parsed.data);
  logger.info({ submissionId: submission.id, email: submission.email }, 'Contact request submitted');

  res.status(201).json({
    success: true,
    message: 'Contact request submitted successfully',
    submissionId: submission.id,
  });
};
