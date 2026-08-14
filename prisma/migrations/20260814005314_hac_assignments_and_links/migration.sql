-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('CANVAS', 'HAC');

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "source" "AssignmentSource" NOT NULL DEFAULT 'CANVAS';

-- CreateTable
CREATE TABLE "AssignmentLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canvasAssignmentId" TEXT NOT NULL,
    "hacAssignmentId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "autoLinked" BOOLEAN NOT NULL DEFAULT true,
    "confirmedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentLink_canvasAssignmentId_key" ON "AssignmentLink"("canvasAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentLink_hacAssignmentId_key" ON "AssignmentLink"("hacAssignmentId");

-- CreateIndex
CREATE INDEX "AssignmentLink_userId_idx" ON "AssignmentLink"("userId");

-- CreateIndex
CREATE INDEX "Assignment_userId_source_idx" ON "Assignment"("userId", "source");

-- AddForeignKey
ALTER TABLE "AssignmentLink" ADD CONSTRAINT "AssignmentLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentLink" ADD CONSTRAINT "AssignmentLink_canvasAssignmentId_fkey" FOREIGN KEY ("canvasAssignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentLink" ADD CONSTRAINT "AssignmentLink_hacAssignmentId_fkey" FOREIGN KEY ("hacAssignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
