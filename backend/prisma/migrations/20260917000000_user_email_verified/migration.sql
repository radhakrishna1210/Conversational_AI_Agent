-- Record when an account's owner proved they read its email address.
--
-- One address is one account whether its owner signs in with a password or
-- with Google. Google sign-in links to an existing account by email, which is
-- only safe if the password on that account belongs to the mailbox owner. Not
-- every password does: an invite token is returned to the INVITER, and a server
-- without SMTP creates password accounts with no email check, so someone else
-- can open `victim@gmail.com` with a password they know. The application now
-- drops a password that was never verified when Google is linked; this is the
-- column it reads.
--
-- Backfill only from evidence, never by assumption:
--   * a Google-linked account — Google vouched for the address;
--   * an account whose signup code was consumed as it was created. Verifying a
--     signup code creates the user and then marks the code consumed, so that
--     consumedAt lands just after createdAt. A code superseded by a resend is
--     also marked consumed, but before any account exists, so it is excluded.
-- Password-reset codes are not evidence: requesting a new one marks the old one
-- consumed too, so a consumed reset code does not show a reset happened.
-- Every other existing account stays NULL. Its owner loses nothing unless they
-- later link Google, at which point the password is dropped and they can set a
-- new one with an emailed code.
--
-- Hand-written and additive like the migrations before it; safe to re-run.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

UPDATE "User"
SET "emailVerifiedAt" = "createdAt"
WHERE "emailVerifiedAt" IS NULL
  AND "googleId" IS NOT NULL;

UPDATE "User" u
SET "emailVerifiedAt" = v."consumedAt"
FROM (
  SELECT lower("email") AS "email", "consumedAt"
  FROM "VerificationToken"
  WHERE "purpose" = 'signup_otp' AND "consumedAt" IS NOT NULL
) v
WHERE u."emailVerifiedAt" IS NULL
  AND lower(u."email") = v."email"
  AND v."consumedAt" BETWEEN u."createdAt" AND u."createdAt" + INTERVAL '5 minutes';
