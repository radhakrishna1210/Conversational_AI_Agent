import { z } from 'zod';

// Both arrive as JSON arrays from a multipart-friendly client, so a string form
// is accepted and unpacked in the controller. The schema only guarantees the
// shape it can see.
const idList = z.union([z.array(z.string()), z.string()]).optional();

export const createBroadcastSchema = z.object({
  name: z.string().min(2).max(120),
  recordingId: z.string().min(1),
  clusterIds: idList,
  fromNumbers: idList,
  // Capped at 5. A message repeated more times than that is not clearer, it is a
  // longer bill and a complaint.
  repeatCount: z.number().int().min(1).max(5).optional(),
});

export const updateBroadcastSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  recordingId: z.string().min(1).optional(),
  fromNumbers: z.array(z.string()).optional(),
  fromNumber: z.string().optional(),
  repeatCount: z.number().int().min(1).max(5).optional(),
});

export const scheduleBroadcastSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
});

export const synthesizeRecordingSchema = z.object({
  name: z.string().max(120).optional(),
  text: z.string().min(1).max(3000),
  voiceId: z.string().min(1),
});
