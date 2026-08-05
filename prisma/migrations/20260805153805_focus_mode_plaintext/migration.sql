-- AlterTable
ALTER TABLE "StudySession" ADD COLUMN     "focusModeActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "focusModeOverride" BOOLEAN NOT NULL DEFAULT false;
