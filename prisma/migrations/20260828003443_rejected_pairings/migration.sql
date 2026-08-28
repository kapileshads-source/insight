-- AlterTable
ALTER TABLE "AssignmentLink" DROP COLUMN "rejectedAt";

-- CreateTable
CREATE TABLE "RejectedPairing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canvasAssignmentId" TEXT NOT NULL,
    "hacAssignmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RejectedPairing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RejectedPairing_userId_idx" ON "RejectedPairing"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RejectedPairing_canvasAssignmentId_hacAssignmentId_key" ON "RejectedPairing"("canvasAssignmentId", "hacAssignmentId");

-- AddForeignKey
ALTER TABLE "RejectedPairing" ADD CONSTRAINT "RejectedPairing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

