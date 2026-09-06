-- Home Access Center credentials, so a student on a phone can see their real
-- gradebook. The password is encrypted with the server key before it gets
-- here, exactly like the Canvas token, and is never written to a log or a URL.
CREATE TABLE "HacConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "passwordIv" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HacConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HacConnection_userId_key" ON "HacConnection"("userId");

ALTER TABLE "HacConnection" ADD CONSTRAINT "HacConnection_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
