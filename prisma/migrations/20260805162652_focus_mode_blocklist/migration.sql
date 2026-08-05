-- AlterTable
ALTER TABLE "User" ADD COLUMN     "blockAllowed" TEXT[],
ADD COLUMN     "blockCategories" TEXT[],
ADD COLUMN     "blockExtra" TEXT[];
