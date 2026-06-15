CREATE TYPE "SupplierOpeningBalanceType" AS ENUM ('payable', 'credit');
CREATE TYPE "CustomerOpeningBalanceType" AS ENUM ('receivable', 'credit');

CREATE TABLE "supplier_opening_balances" (
  "id" SERIAL NOT NULL,
  "supplier_id" INTEGER NOT NULL,
  "type" "SupplierOpeningBalanceType" NOT NULL DEFAULT 'payable',
  "amount" DECIMAL(12, 2) NOT NULL,
  "balance_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_opening_balances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_opening_balances_supplier_id_idx" ON "supplier_opening_balances"("supplier_id");
CREATE INDEX "supplier_opening_balances_balance_date_idx" ON "supplier_opening_balances"("balance_date");
CREATE INDEX "supplier_opening_balances_type_idx" ON "supplier_opening_balances"("type");

ALTER TABLE "supplier_opening_balances"
  ADD CONSTRAINT "supplier_opening_balances_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_opening_balances"
  ADD CONSTRAINT "supplier_opening_balances_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supplier_opening_balances"
  ADD CONSTRAINT "supplier_opening_balances_amount_check" CHECK ("amount" > 0);

CREATE TABLE "customer_opening_balances" (
  "id" SERIAL NOT NULL,
  "customer_id" INTEGER NOT NULL,
  "type" "CustomerOpeningBalanceType" NOT NULL DEFAULT 'receivable',
  "amount" DECIMAL(12, 2) NOT NULL,
  "balance_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_opening_balances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_opening_balances_customer_id_idx" ON "customer_opening_balances"("customer_id");
CREATE INDEX "customer_opening_balances_balance_date_idx" ON "customer_opening_balances"("balance_date");
CREATE INDEX "customer_opening_balances_type_idx" ON "customer_opening_balances"("type");

ALTER TABLE "customer_opening_balances"
  ADD CONSTRAINT "customer_opening_balances_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_opening_balances"
  ADD CONSTRAINT "customer_opening_balances_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_opening_balances"
  ADD CONSTRAINT "customer_opening_balances_amount_check" CHECK ("amount" > 0);

CREATE TABLE "customer_payments" (
  "id" SERIAL NOT NULL,
  "customer_id" INTEGER NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "payment_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payment_method" VARCHAR(60),
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_payments_customer_id_idx" ON "customer_payments"("customer_id");
CREATE INDEX "customer_payments_payment_date_idx" ON "customer_payments"("payment_date");

ALTER TABLE "customer_payments"
  ADD CONSTRAINT "customer_payments_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_payments"
  ADD CONSTRAINT "customer_payments_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_payments"
  ADD CONSTRAINT "customer_payments_amount_check" CHECK ("amount" > 0);
