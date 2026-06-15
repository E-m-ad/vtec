CREATE TABLE "sale_payments" (
  "id" SERIAL NOT NULL,
  "sale_id" INTEGER NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "payment_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payment_method" VARCHAR(60),
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sale_payments_sale_id_idx" ON "sale_payments"("sale_id");
CREATE INDEX "sale_payments_payment_date_idx" ON "sale_payments"("payment_date");

ALTER TABLE "sale_payments"
  ADD CONSTRAINT "sale_payments_sale_id_fkey"
  FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sale_payments"
  ADD CONSTRAINT "sale_payments_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "sale_payments" ("sale_id", "amount", "payment_date", "payment_method", "notes", "created_by", "created_at")
SELECT "id", "paid_amount", "sale_date", "payment_method", 'Migrated initial sale payment', "created_by", "created_at"
FROM "sales"
WHERE "paid_amount" > 0;
