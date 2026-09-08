-- AlterTable
ALTER TABLE "DistrictCalendarDay" ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "DistrictCalendarDay_needsReview_idx" ON "DistrictCalendarDay"("needsReview");

-- Backfill: the five dates the extractor flagged, previously a hardcoded array
-- in the admin page. Moving them here is what lets confirming one clear it.
UPDATE "DistrictCalendarDay" SET "needsReview" = true
WHERE "date" IN (
  DATE '2026-10-01',
  DATE '2027-04-07',
  DATE '2027-04-22',
  DATE '2027-05-03',
  DATE '2027-05-10'
);
