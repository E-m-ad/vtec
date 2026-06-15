CREATE TYPE "ServiceJobStatus" AS ENUM ('open', 'in_service', 'finished', 'invoiced', 'cancelled');

CREATE TABLE "service_jobs" (
  "id" SERIAL NOT NULL,
  "job_number" VARCHAR(120) NOT NULL,
  "customer_id" INTEGER,
  "car_id" INTEGER NOT NULL,
  "sale_id" INTEGER,
  "status" "ServiceJobStatus" NOT NULL DEFAULT 'in_service',
  "start_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expected_finish_date" DATE,
  "finished_at" TIMESTAMPTZ(3),
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_job_items" (
  "id" SERIAL NOT NULL,
  "job_id" INTEGER NOT NULL,
  "product_id" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_cost" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "unit_price" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "line_total" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_job_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_job_payments" (
  "id" SERIAL NOT NULL,
  "job_id" INTEGER NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "payment_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payment_method" VARCHAR(60),
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_job_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_jobs_job_number_key" ON "service_jobs"("job_number");
CREATE UNIQUE INDEX "service_jobs_sale_id_key" ON "service_jobs"("sale_id");
CREATE INDEX "service_jobs_customer_id_idx" ON "service_jobs"("customer_id");
CREATE INDEX "service_jobs_car_id_idx" ON "service_jobs"("car_id");
CREATE INDEX "service_jobs_status_idx" ON "service_jobs"("status");
CREATE INDEX "service_jobs_start_date_idx" ON "service_jobs"("start_date");
CREATE INDEX "service_job_items_job_id_idx" ON "service_job_items"("job_id");
CREATE INDEX "service_job_items_product_id_idx" ON "service_job_items"("product_id");
CREATE INDEX "service_job_payments_job_id_idx" ON "service_job_payments"("job_id");
CREATE INDEX "service_job_payments_payment_date_idx" ON "service_job_payments"("payment_date");

ALTER TABLE "service_jobs"
  ADD CONSTRAINT "service_jobs_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_jobs"
  ADD CONSTRAINT "service_jobs_car_id_fkey"
  FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_jobs"
  ADD CONSTRAINT "service_jobs_sale_id_fkey"
  FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_jobs"
  ADD CONSTRAINT "service_jobs_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_job_items"
  ADD CONSTRAINT "service_job_items_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "service_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_job_items"
  ADD CONSTRAINT "service_job_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_job_items"
  ADD CONSTRAINT "service_job_items_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_job_payments"
  ADD CONSTRAINT "service_job_payments_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "service_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_job_payments"
  ADD CONSTRAINT "service_job_payments_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
