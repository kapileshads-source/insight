-- Ticking an assignment off. Nullable and additive, so existing rows are
-- simply "not ticked" and nothing has to be backfilled.
ALTER TABLE "Assignment" ADD COLUMN "completedAt" TIMESTAMP(3);

-- The reminder counts assignments due tomorrow that are not done, per user.
CREATE INDEX "Assignment_userId_completedAt_idx" ON "Assignment"("userId", "completedAt");
