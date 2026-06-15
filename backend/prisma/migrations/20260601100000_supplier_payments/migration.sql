CREATE TABLE "supplier_payments" (
  "id" SERIAL NOT NULL,
  "supplier_id" INTEGER NOT NULL,
  "purchase_id" INTEGER,
  "amount" DECIMAL(12, 2) NOT NULL,
  "payment_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payment_method" VARCHAR(60),
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_payments_supplier_id_idx" ON "supplier_payments"("supplier_id");
CREATE INDEX "supplier_payments_purchase_id_idx" ON "supplier_payments"("purchase_id");
CREATE INDEX "supplier_payments_payment_date_idx" ON "supplier_payments"("payment_date");

ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_purchase_id_fkey"
  FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_amount_check" CHECK ("amount" > 0);
