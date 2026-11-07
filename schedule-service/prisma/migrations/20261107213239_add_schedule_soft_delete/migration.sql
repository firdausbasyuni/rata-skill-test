-- DropIndex
DROP INDEX "schedules_doctorId_scheduledAt_key";

-- AlterTable
ALTER TABLE "schedules" ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "deletedBy" UUID;

-- CreateIndex
CREATE INDEX "schedules_doctorId_idx" ON "schedules"("doctorId");
