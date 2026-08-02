-- CreateEnum
CREATE TYPE "SchoolType" AS ENUM ('HIGH', 'MIDDLE');

-- CreateEnum
CREATE TYPE "DayType" AS ENUM ('REGULAR', 'A_DAY', 'B_DAY');

-- CreateEnum
CREATE TYPE "SubmissionState" AS ENUM ('UNSUBMITTED', 'SUBMITTED', 'LATE', 'MISSING', 'GRADED');

-- CreateEnum
CREATE TYPE "OutcomeSource" AS ENUM ('CANVAS', 'MANUAL');

-- CreateEnum
CREATE TYPE "StudyLocation" AS ENUM ('LIBRARY', 'HOME', 'CLASSROOM', 'OTHER');

-- CreateEnum
CREATE TYPE "ScreenTimeSource" AS ENUM ('OCR_IOS', 'OCR_ANDROID', 'NATIVE_WINDOWS', 'NATIVE_MACOS', 'NATIVE_ANDROID', 'MANUAL');

-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('BROWSER_EXTENSION', 'WINDOWS_APP', 'MACOS_APP', 'ANDROID_APP');

-- CreateEnum
CREATE TYPE "InsightCategory" AS ENUM ('SLEEP', 'STUDY_TIMING', 'SESSION_LENGTH', 'LOCATION', 'PHONE_USAGE', 'DISTRACTION', 'WELLBEING');

-- CreateEnum
CREATE TYPE "InsightDirection" AS ENUM ('POSITIVE', 'NEGATIVE', 'NEUTRAL');

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SchoolType" NOT NULL,
    "promptInterval" INTEGER NOT NULL DEFAULT 1,
    "usesBlockSchedule" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Period" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "dayType" "DayType" NOT NULL DEFAULT 'REGULAR',
    "number" INTEGER NOT NULL,
    "label" TEXT,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "isInstructional" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleOverride" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dayType" "DayType",
    "note" TEXT,

    CONSTRAINT "ScheduleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "schoolId" TEXT,
    "gradeLevel" INTEGER,
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canvasId" TEXT,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "canvasId" TEXT,
    "name" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "pointsPossible" DOUBLE PRECISION,
    "submissionState" "SubmissionState" NOT NULL DEFAULT 'UNSUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outcome" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "label" TEXT,
    "pointsEarned" DOUBLE PRECISION NOT NULL,
    "pointsPossible" DOUBLE PRECISION NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "source" "OutcomeSource" NOT NULL,
    "conflictsWithSource" "OutcomeSource",
    "occurredOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "location" "StudyLocation",
    "locationNote" TEXT,
    "stressLevel" INTEGER,
    "selfRatedDifficulty" INTEGER,
    "wasCramSession" BOOLEAN,
    "distractedSeconds" INTEGER,
    "focusModeActive" BOOLEAN NOT NULL DEFAULT false,
    "focusModeOverride" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtensionActivity" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtensionActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FocusBlockEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "siteBlocked" TEXT NOT NULL,
    "overrideUsed" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FocusBlockEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SleepEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "forDate" DATE NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SleepEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreenTimeEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "forDate" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "source" "ScreenTimeSource" NOT NULL,
    "ocrRawValue" TEXT,
    "ocrConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "editedByUser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreenTimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "DeviceKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "lastPromptedOn" DATE,
    "lastPromptedPeriod" INTEGER,
    "postTermPromptShown" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "InsightCategory" NOT NULL,
    "factor" TEXT NOT NULL,
    "direction" "InsightDirection" NOT NULL,
    "magnitude" DOUBLE PRECISION NOT NULL,
    "thresholdLabel" TEXT,
    "sampleSize" INTEGER NOT NULL,
    "counterExamples" INTEGER NOT NULL DEFAULT 0,
    "subjectsHeld" INTEGER NOT NULL DEFAULT 0,
    "weeksHeld" INTEGER NOT NULL DEFAULT 0,
    "isSurfaced" BOOLEAN NOT NULL DEFAULT false,
    "firstComputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastComputedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutedInsightCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "InsightCategory" NOT NULL,
    "mutedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutedInsightCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_InsightToRecommendation" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_InsightToRecommendation_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "School_name_key" ON "School"("name");

-- CreateIndex
CREATE INDEX "Period_schoolId_dayType_idx" ON "Period"("schoolId", "dayType");

-- CreateIndex
CREATE UNIQUE INDEX "Period_schoolId_dayType_number_key" ON "Period"("schoolId", "dayType", "number");

-- CreateIndex
CREATE INDEX "Term_schoolId_startDate_idx" ON "Term"("schoolId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "Term_schoolId_name_key" ON "Term"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOverride_schoolId_date_key" ON "ScheduleOverride"("schoolId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_schoolId_idx" ON "User"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "CanvasConnection_userId_key" ON "CanvasConnection"("userId");

-- CreateIndex
CREATE INDEX "Course_userId_idx" ON "Course"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_userId_canvasId_key" ON "Course"("userId", "canvasId");

-- CreateIndex
CREATE INDEX "Assignment_userId_dueAt_idx" ON "Assignment"("userId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_userId_canvasId_key" ON "Assignment"("userId", "canvasId");

-- CreateIndex
CREATE UNIQUE INDEX "Outcome_assignmentId_key" ON "Outcome"("assignmentId");

-- CreateIndex
CREATE INDEX "Outcome_userId_occurredOn_idx" ON "Outcome"("userId", "occurredOn");

-- CreateIndex
CREATE INDEX "StudySession_userId_startedAt_idx" ON "StudySession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "ExtensionActivity_sessionId_idx" ON "ExtensionActivity"("sessionId");

-- CreateIndex
CREATE INDEX "FocusBlockEvent_sessionId_idx" ON "FocusBlockEvent"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SleepEntry_userId_forDate_key" ON "SleepEntry"("userId", "forDate");

-- CreateIndex
CREATE INDEX "ScreenTimeEntry_userId_forDate_idx" ON "ScreenTimeEntry"("userId", "forDate");

-- CreateIndex
CREATE UNIQUE INDEX "ScreenTimeEntry_userId_forDate_source_key" ON "ScreenTimeEntry"("userId", "forDate", "source");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_tokenHash_key" ON "DeviceToken"("tokenHash");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_kind_idx" ON "DeviceToken"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PromptState_userId_termId_key" ON "PromptState"("userId", "termId");

-- CreateIndex
CREATE INDEX "Insight_userId_isSurfaced_idx" ON "Insight"("userId", "isSurfaced");

-- CreateIndex
CREATE UNIQUE INDEX "Insight_userId_factor_key" ON "Insight"("userId", "factor");

-- CreateIndex
CREATE UNIQUE INDEX "MutedInsightCategory_userId_category_key" ON "MutedInsightCategory"("userId", "category");

-- CreateIndex
CREATE INDEX "Recommendation_userId_createdAt_idx" ON "Recommendation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "_InsightToRecommendation_B_index" ON "_InsightToRecommendation"("B");

-- AddForeignKey
ALTER TABLE "Period" ADD CONSTRAINT "Period_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleOverride" ADD CONSTRAINT "ScheduleOverride_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasConnection" ADD CONSTRAINT "CanvasConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionActivity" ADD CONSTRAINT "ExtensionActivity_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusBlockEvent" ADD CONSTRAINT "FocusBlockEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SleepEntry" ADD CONSTRAINT "SleepEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenTimeEntry" ADD CONSTRAINT "ScreenTimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptState" ADD CONSTRAINT "PromptState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptState" ADD CONSTRAINT "PromptState_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutedInsightCategory" ADD CONSTRAINT "MutedInsightCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InsightToRecommendation" ADD CONSTRAINT "_InsightToRecommendation_A_fkey" FOREIGN KEY ("A") REFERENCES "Insight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InsightToRecommendation" ADD CONSTRAINT "_InsightToRecommendation_B_fkey" FOREIGN KEY ("B") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
