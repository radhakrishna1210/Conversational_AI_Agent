-- Idempotency claim for deliverPostCall: set once delivery has run for a
-- call, so a second trigger skips instead of re-syncing every destination.

-- AlterTable
ALTER TABLE "AgentCallLog" ADD COLUMN     "postCallDeliveredAt" TIMESTAMP(3);
