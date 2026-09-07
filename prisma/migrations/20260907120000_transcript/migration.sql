-- The transcript, encrypted with the student's own key like every other
-- record. Nullable and additive: an account without one simply has not synced.
ALTER TABLE "User" ADD COLUMN "transcriptCipher" TEXT;
ALTER TABLE "User" ADD COLUMN "transcriptIv" TEXT;
