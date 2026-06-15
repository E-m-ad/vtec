ALTER TABLE "service_estimates"
ADD COLUMN IF NOT EXISTS "is_supplemental" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "source_status" "ServiceJobStatus";

CREATE INDEX IF NOT EXISTS "service_estimates_job_id_is_supplemental_idx"
ON "service_estimates"("job_id", "is_supplemental");
