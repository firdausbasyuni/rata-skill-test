CREATE UNIQUE INDEX "schedules_doctor_scheduled_at_active_key"
ON "schedules" ("doctorId", "scheduledAt")
WHERE "deletedAt" IS NULL;