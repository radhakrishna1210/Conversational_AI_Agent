-- Per-agent call-recording format (FLAC lossless / OPUS lossy), Superadmin-only.
-- See prisma/schema.prisma (model Agent, field recordingFormat),
-- backend/src/constants/recordingFormat.js, and
-- backend/src/controllers/admin.controller.js#setAgentRecordingFormat.
--
-- Defaulted to FLAC for every existing agent: recordings feed STT/voice-cloning/
-- sentiment training, and FLAC is lossless, so no agent silently loses fidelity
-- when this column is introduced. A Superadmin opts specific agents into OPUS
-- afterwards where storage/bandwidth matters more than training fidelity.

ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "recordingFormat" TEXT NOT NULL DEFAULT 'FLAC';
