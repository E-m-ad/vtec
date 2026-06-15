CREATE TYPE "ServiceJobStatus_new" AS ENUM (
  'RECEIVED',
  'AWAITING_DIAGNOSIS',
  'DIAGNOSIS_IN_PROGRESS',
  'DIAGNOSIS_DONE',
  'ESTIMATE_CREATED',
  'AWAITING_APPROVAL',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'REJECTED',
  'WAITING_PARTS',
  'WORK_IN_PROGRESS',
  'WORK_DONE',
  'QC_IN_PROGRESS',
  'QC_FAILED',
  'QC_PASSED',
  'READY_FOR_INVOICE',
  'INVOICED',
  'PAYMENT_PENDING',
  'PAID',
  'READY_FOR_DELIVERY',
  'DELIVERED',
  'CLOSED',
  'CANCELLED'
);

ALTER TABLE "service_jobs" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "service_jobs"
  ALTER COLUMN "status" TYPE "ServiceJobStatus_new"
  USING (
    CASE "status"::text
      WHEN 'open' THEN 'RECEIVED'
      WHEN 'in_service' THEN 'WORK_IN_PROGRESS'
      WHEN 'finished' THEN 'WORK_DONE'
      WHEN 'invoiced' THEN 'INVOICED'
      WHEN 'cancelled' THEN 'CANCELLED'
      ELSE 'RECEIVED'
    END
  )::"ServiceJobStatus_new";
ALTER TYPE "ServiceJobStatus" RENAME TO "ServiceJobStatus_old";
ALTER TYPE "ServiceJobStatus_new" RENAME TO "ServiceJobStatus";
DROP TYPE "ServiceJobStatus_old";
ALTER TABLE "service_jobs" ALTER COLUMN "status" SET DEFAULT 'RECEIVED';

CREATE TYPE "ServiceEstimateStatus" AS ENUM ('draft', 'sent', 'approved', 'partially_approved', 'rejected');
CREATE TYPE "ServiceLineApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "ServiceWorkOrderStatus" AS ENUM ('pending', 'in_progress', 'done', 'cancelled');
CREATE TYPE "ServiceWorkLineStatus" AS ENUM ('pending', 'in_progress', 'done', 'rework', 'cancelled');
CREATE TYPE "ServicePartRequestStatus" AS ENUM ('requested', 'reserved', 'issued', 'unavailable', 'returned');
CREATE TYPE "ServiceApprovalMethod" AS ENUM ('paper_signature', 'phone', 'whatsapp', 'sms', 'email', 'system');
CREATE TYPE "ServiceCustomerApprovalStatus" AS ENUM ('approved', 'partially_approved', 'rejected');

ALTER TABLE "service_jobs"
  ADD COLUMN "current_stage" VARCHAR(80),
  ADD COLUMN "assigned_advisor_id" INTEGER,
  ADD COLUMN "assigned_technician_id" INTEGER,
  ADD COLUMN "opened_at" TIMESTAMPTZ(3),
  ADD COLUMN "closed_at" TIMESTAMPTZ(3);

UPDATE "service_jobs"
SET
  "opened_at" = COALESCE("start_date", CURRENT_TIMESTAMP),
  "current_stage" = "status"::text;

ALTER TABLE "service_jobs"
  ALTER COLUMN "opened_at" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "opened_at" SET NOT NULL;

ALTER TABLE "service_job_items"
  ADD COLUMN "estimate_line_id" INTEGER,
  ADD COLUMN "approved_quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "issued_quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "returned_quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "approval_status" "ServiceLineApprovalStatus" NOT NULL DEFAULT 'approved',
  ADD COLUMN "work_status" "ServiceWorkLineStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "completed_at" TIMESTAMPTZ(3);

UPDATE "service_job_items" AS "item"
SET
  "approved_quantity" = "item"."quantity",
  "issued_quantity" = CASE WHEN "item"."line_type" = 'product' THEN "item"."quantity" ELSE 0 END,
  "work_status" = CASE
    WHEN "job"."status" IN (
      'WORK_DONE',
      'QC_IN_PROGRESS',
      'QC_PASSED',
      'READY_FOR_INVOICE',
      'INVOICED',
      'PAYMENT_PENDING',
      'PAID',
      'READY_FOR_DELIVERY',
      'DELIVERED',
      'CLOSED'
    ) THEN 'done'::"ServiceWorkLineStatus"
    ELSE 'pending'::"ServiceWorkLineStatus"
  END
FROM "service_jobs" AS "job"
WHERE "job"."id" = "item"."job_id";

CREATE TABLE "service_job_complaints" (
  "id" SERIAL NOT NULL,
  "job_id" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_job_complaints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_check_in_inspections" (
  "id" SERIAL NOT NULL,
  "job_id" INTEGER NOT NULL,
  "odometer" INTEGER,
  "fuel_level" VARCHAR(40),
  "visual_inspection" TEXT,
  "photos" JSONB,
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_check_in_inspections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_diagnosis_reports" (
  "id" SERIAL NOT NULL,
  "job_id" INTEGER NOT NULL,
  "technician_id" INTEGER,
  "diagnosis_notes" TEXT,
  "fault_codes" TEXT,
  "cause" TEXT,
  "recommended_work" TEXT,
  "diagnostic_fee" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_diagnosis_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_estimates" (
  "id" SERIAL NOT NULL,
  "job_id" INTEGER NOT NULL,
  "diagnosis_report_id" INTEGER,
  "estimate_number" VARCHAR(120) NOT NULL,
  "status" "ServiceEstimateStatus" NOT NULL DEFAULT 'draft',
  "subtotal" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "discount_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "tax_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "total_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "sent_at" TIMESTAMPTZ(3),
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_estimates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_estimate_lines" (
  "id" SERIAL NOT NULL,
  "estimate_id" INTEGER NOT NULL,
  "product_id" INTEGER,
  "line_type" "InvoiceLineType" NOT NULL DEFAULT 'product',
  "description" VARCHAR(220),
  "quantity" INTEGER NOT NULL,
  "approved_quantity" INTEGER NOT NULL DEFAULT 0,
  "approval_status" "ServiceLineApprovalStatus" NOT NULL DEFAULT 'pending',
  "unit_cost" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "unit_price" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "discount_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "tax_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "line_total" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_estimate_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_customer_approvals" (
  "id" SERIAL NOT NULL,
  "job_id" INTEGER NOT NULL,
  "estimate_id" INTEGER NOT NULL,
  "status" "ServiceCustomerApprovalStatus" NOT NULL,
  "method" "ServiceApprovalMethod" NOT NULL,
  "approved_by" VARCHAR(160),
  "approved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_customer_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_work_orders" (
  "id" SERIAL NOT NULL,
  "job_id" INTEGER NOT NULL,
  "status" "ServiceWorkOrderStatus" NOT NULL DEFAULT 'pending',
  "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_work_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_work_order_lines" (
  "id" SERIAL NOT NULL,
  "work_order_id" INTEGER NOT NULL,
  "job_item_id" INTEGER,
  "assigned_technician_id" INTEGER,
  "status" "ServiceWorkLineStatus" NOT NULL DEFAULT 'pending',
  "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_work_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_part_requests" (
  "id" SERIAL NOT NULL,
  "job_id" INTEGER NOT NULL,
  "job_item_id" INTEGER,
  "product_id" INTEGER NOT NULL,
  "requested_quantity" INTEGER NOT NULL DEFAULT 0,
  "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
  "issued_quantity" INTEGER NOT NULL DEFAULT 0,
  "returned_quantity" INTEGER NOT NULL DEFAULT 0,
  "status" "ServicePartRequestStatus" NOT NULL DEFAULT 'requested',
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_part_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_qc_reports" (
  "id" SERIAL NOT NULL,
  "job_id" INTEGER NOT NULL,
  "complaint_solved" BOOLEAN NOT NULL DEFAULT false,
  "road_test_done" BOOLEAN NOT NULL DEFAULT false,
  "scanner_check_done" BOOLEAN NOT NULL DEFAULT false,
  "leaks_checked" BOOLEAN NOT NULL DEFAULT false,
  "passed" BOOLEAN NOT NULL DEFAULT false,
  "final_notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_qc_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_delivery_handovers" (
  "id" SERIAL NOT NULL,
  "job_id" INTEGER NOT NULL,
  "delivered_by" INTEGER,
  "received_by_name" VARCHAR(160),
  "customer_signed" BOOLEAN NOT NULL DEFAULT false,
  "delivered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_delivery_handovers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_job_history" (
  "id" SERIAL NOT NULL,
  "job_id" INTEGER NOT NULL,
  "from_status" "ServiceJobStatus",
  "to_status" "ServiceJobStatus",
  "action" VARCHAR(120) NOT NULL,
  "performed_by" INTEGER,
  "note" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_job_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_estimates_estimate_number_key" ON "service_estimates"("estimate_number");
CREATE UNIQUE INDEX "service_job_items_estimate_line_id_key" ON "service_job_items"("estimate_line_id");

CREATE INDEX "service_jobs_assigned_advisor_id_idx" ON "service_jobs"("assigned_advisor_id");
CREATE INDEX "service_jobs_assigned_technician_id_idx" ON "service_jobs"("assigned_technician_id");
CREATE INDEX "service_jobs_opened_at_idx" ON "service_jobs"("opened_at");
CREATE INDEX "service_job_items_approval_status_idx" ON "service_job_items"("approval_status");
CREATE INDEX "service_job_items_work_status_idx" ON "service_job_items"("work_status");
CREATE INDEX "service_job_complaints_job_id_idx" ON "service_job_complaints"("job_id");
CREATE INDEX "service_check_in_inspections_job_id_idx" ON "service_check_in_inspections"("job_id");
CREATE INDEX "service_diagnosis_reports_job_id_idx" ON "service_diagnosis_reports"("job_id");
CREATE INDEX "service_diagnosis_reports_technician_id_idx" ON "service_diagnosis_reports"("technician_id");
CREATE INDEX "service_estimates_job_id_idx" ON "service_estimates"("job_id");
CREATE INDEX "service_estimates_diagnosis_report_id_idx" ON "service_estimates"("diagnosis_report_id");
CREATE INDEX "service_estimates_status_idx" ON "service_estimates"("status");
CREATE INDEX "service_estimate_lines_estimate_id_idx" ON "service_estimate_lines"("estimate_id");
CREATE INDEX "service_estimate_lines_product_id_idx" ON "service_estimate_lines"("product_id");
CREATE INDEX "service_estimate_lines_approval_status_idx" ON "service_estimate_lines"("approval_status");
CREATE INDEX "service_customer_approvals_job_id_idx" ON "service_customer_approvals"("job_id");
CREATE INDEX "service_customer_approvals_estimate_id_idx" ON "service_customer_approvals"("estimate_id");
CREATE INDEX "service_customer_approvals_status_idx" ON "service_customer_approvals"("status");
CREATE INDEX "service_work_orders_job_id_idx" ON "service_work_orders"("job_id");
CREATE INDEX "service_work_orders_status_idx" ON "service_work_orders"("status");
CREATE INDEX "service_work_order_lines_work_order_id_idx" ON "service_work_order_lines"("work_order_id");
CREATE INDEX "service_work_order_lines_job_item_id_idx" ON "service_work_order_lines"("job_item_id");
CREATE INDEX "service_work_order_lines_assigned_technician_id_idx" ON "service_work_order_lines"("assigned_technician_id");
CREATE INDEX "service_work_order_lines_status_idx" ON "service_work_order_lines"("status");
CREATE INDEX "service_part_requests_job_id_idx" ON "service_part_requests"("job_id");
CREATE INDEX "service_part_requests_job_item_id_idx" ON "service_part_requests"("job_item_id");
CREATE INDEX "service_part_requests_product_id_idx" ON "service_part_requests"("product_id");
CREATE INDEX "service_part_requests_status_idx" ON "service_part_requests"("status");
CREATE INDEX "service_qc_reports_job_id_idx" ON "service_qc_reports"("job_id");
CREATE INDEX "service_qc_reports_passed_idx" ON "service_qc_reports"("passed");
CREATE INDEX "service_delivery_handovers_job_id_idx" ON "service_delivery_handovers"("job_id");
CREATE INDEX "service_delivery_handovers_delivered_at_idx" ON "service_delivery_handovers"("delivered_at");
CREATE INDEX "service_job_history_job_id_idx" ON "service_job_history"("job_id");
CREATE INDEX "service_job_history_created_at_idx" ON "service_job_history"("created_at");

ALTER TABLE "service_jobs"
  ADD CONSTRAINT "service_jobs_assigned_advisor_id_fkey"
  FOREIGN KEY ("assigned_advisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_jobs"
  ADD CONSTRAINT "service_jobs_assigned_technician_id_fkey"
  FOREIGN KEY ("assigned_technician_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_job_items"
  ADD CONSTRAINT "service_job_items_estimate_line_id_fkey"
  FOREIGN KEY ("estimate_line_id") REFERENCES "service_estimate_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_job_complaints"
  ADD CONSTRAINT "service_job_complaints_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "service_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_job_complaints_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_check_in_inspections"
  ADD CONSTRAINT "service_check_in_inspections_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "service_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_check_in_inspections_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_diagnosis_reports"
  ADD CONSTRAINT "service_diagnosis_reports_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "service_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_diagnosis_reports_technician_id_fkey"
  FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "service_diagnosis_reports_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_estimates"
  ADD CONSTRAINT "service_estimates_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "service_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_estimates_diagnosis_report_id_fkey"
  FOREIGN KEY ("diagnosis_report_id") REFERENCES "service_diagnosis_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "service_estimates_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_estimate_lines"
  ADD CONSTRAINT "service_estimate_lines_estimate_id_fkey"
  FOREIGN KEY ("estimate_id") REFERENCES "service_estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_estimate_lines_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_customer_approvals"
  ADD CONSTRAINT "service_customer_approvals_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "service_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_customer_approvals_estimate_id_fkey"
  FOREIGN KEY ("estimate_id") REFERENCES "service_estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_customer_approvals_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_work_orders"
  ADD CONSTRAINT "service_work_orders_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "service_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_work_orders_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_work_order_lines"
  ADD CONSTRAINT "service_work_order_lines_work_order_id_fkey"
  FOREIGN KEY ("work_order_id") REFERENCES "service_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_work_order_lines_job_item_id_fkey"
  FOREIGN KEY ("job_item_id") REFERENCES "service_job_items"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "service_work_order_lines_assigned_technician_id_fkey"
  FOREIGN KEY ("assigned_technician_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "service_work_order_lines_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_part_requests"
  ADD CONSTRAINT "service_part_requests_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "service_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_part_requests_job_item_id_fkey"
  FOREIGN KEY ("job_item_id") REFERENCES "service_job_items"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "service_part_requests_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "service_part_requests_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_qc_reports"
  ADD CONSTRAINT "service_qc_reports_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "service_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_qc_reports_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_delivery_handovers"
  ADD CONSTRAINT "service_delivery_handovers_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "service_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_delivery_handovers_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_job_history"
  ADD CONSTRAINT "service_job_history_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "service_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_job_history_performed_by_fkey"
  FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "service_job_history" ("job_id", "from_status", "to_status", "action", "note", "created_at")
SELECT
  "id",
  NULL,
  "status",
  'legacy_status_import',
  'Imported current status during service workflow migration',
  COALESCE("created_at", CURRENT_TIMESTAMP)
FROM "service_jobs";
