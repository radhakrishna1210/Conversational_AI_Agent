-- Count the codes tried against each emailed verification token.
--
-- Signup and password-reset codes are 6 digits with a 10-30 minute life, and a
-- wrong code used to leave the token live for the next guess. The per-IP rate
-- limiter was the only brake, so a password reset was brute-forceable. The
-- application now burns a token after a handful of attempts; this is the
-- column it counts in.
--
-- Hand-written and additive, like the migrations before it: a default of 0 so
-- every existing row is valid as it stands, guarded, safe to re-run.

ALTER TABLE "VerificationToken" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
