-- Add employee attendance tracking and barcode tokens.
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent');

ALTER TABLE "employees"
  ADD COLUMN "attendance_token" VARCHAR(120);

UPDATE "employees"
SET "attendance_token" = 'att_' || md5("id"::text || random()::text || clock_timestamp()::text)
WHERE "attendance_token" IS NULL;

CREATE UNIQUE INDEX "employees_attendance_token_key" ON "employees"("attendance_token");

CREATE TABLE "employee_attendance" (
  "id" SERIAL NOT NULL,
  "employee_id" INTEGER NOT NULL,
  "attendance_date" DATE NOT NULL,
  "status" "AttendanceStatus" NOT NULL,
  "check_in_at" TIMESTAMPTZ(3),
  "deduction_amount" DECIMAL(12, 2),
  "deduction_transaction_id" INTEGER,
  "notes" TEXT,
  "finalized" BOOLEAN NOT NULL DEFAULT false,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employee_attendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_attendance_employee_id_attendance_date_key"
  ON "employee_attendance"("employee_id", "attendance_date");

CREATE UNIQUE INDEX "employee_attendance_deduction_transaction_id_key"
  ON "employee_attendance"("deduction_transaction_id");

CREATE INDEX "employee_attendance_attendance_date_idx" ON "employee_attendance"("attendance_date");
CREATE INDEX "employee_attendance_status_idx" ON "employee_attendance"("status");
CREATE INDEX "employee_attendance_finalized_idx" ON "employee_attendance"("finalized");

ALTER TABLE "employee_attendance"
  ADD CONSTRAINT "employee_attendance_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_attendance"
  ADD CONSTRAINT "employee_attendance_deduction_transaction_id_fkey"
  FOREIGN KEY ("deduction_transaction_id") REFERENCES "employee_salary_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_attendance"
  ADD CONSTRAINT "employee_attendance_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
