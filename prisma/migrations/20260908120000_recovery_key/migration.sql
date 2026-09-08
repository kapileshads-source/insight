-- AlterTable
ALTER TABLE "EncryptionKey" ADD COLUMN     "recoveryCreatedAt" TIMESTAMP(3),
ADD COLUMN     "recoverySalt" TEXT,
ADD COLUMN     "recoveryVerifierCipher" TEXT,
ADD COLUMN     "recoveryVerifierIv" TEXT,
ADD COLUMN     "recoveryWrapIv" TEXT,
ADD COLUMN     "recoveryWrappedDek" TEXT;
