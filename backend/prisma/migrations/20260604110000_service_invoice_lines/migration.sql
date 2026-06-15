CREATE TYPE "InvoiceLineType" AS ENUM ('product', 'service');

ALTER TABLE "sale_items"
  ADD COLUMN "line_type" "InvoiceLineType" NOT NULL DEFAULT 'product',
  ADD COLUMN "description" VARCHAR(220);

ALTER TABLE "sale_items"
  ALTER COLUMN "product_id" DROP NOT NULL;

ALTER TABLE "service_job_items"
  ADD COLUMN "line_type" "InvoiceLineType" NOT NULL DEFAULT 'product',
  ADD COLUMN "description" VARCHAR(220);

ALTER TABLE "service_job_items"
  ALTER COLUMN "product_id" DROP NOT NULL;
