-- DropForeignKey
ALTER TABLE "Outcome" DROP CONSTRAINT "Outcome_courseId_fkey";

-- AlterTable
ALTER TABLE "Outcome" ALTER COLUMN "courseId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
