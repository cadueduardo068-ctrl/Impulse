ALTER TABLE "twoFactor" ADD COLUMN IF NOT EXISTS "failedVerificationCount" integer NOT NULL DEFAULT 0;
ALTER TABLE "twoFactor" ADD COLUMN IF NOT EXISTS "lockedUntil" timestamp;
