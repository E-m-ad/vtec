CREATE TYPE "SupplierRefundType" AS ENUM ('credit_note', 'cash_refund');

CREATE TABLE "purchase_returns" (
  "id" SERIAL NOT NULL,
  "purchase_id" INTEGER NOT NULL,
  "supplier_id" INTEGER,
  "return_number" VARCHAR(120) NOT NULL,
  "return_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "total_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_returns_total_amount_check" CHECK ("total_amount" >= 0)
);

CREATE TABLE "purchase_return_items" (
  "id" SERIAL NOT NULL,
  "purchase_return_id" INTEGER NOT NULL,
  "purchase_item_id" INTEGER NOT NULL,
  "product_id" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_cost" DECIMAL(12, 2) NOT NULL,
  "line_total" DECIMAL(12, 2) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "purchase_return_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_return_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "purchase_return_items_unit_cost_check" CHECK ("unit_cost" >= 0),
  CONSTRAINT "purchase_return_items_line_total_check" CHECK ("line_total" >= 0)
);

CREATE TABLE "customer_refunds" (
  "id" SERIAL NOT NULL,
  "customer_id" INTEGER NOT NULL,
  "sale_id" INTEGER,
  "amount" DECIMAL(12, 2) NOT NULL,
  "refund_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payment_method" VARCHAR(60),
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "customer_refunds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_refunds_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "supplier_refunds" (
  "id" SERIAL NOT NULL,
  "supplier_id" INTEGER NOT NULL,
  "purchase_id" INTEGER,
  "type" "SupplierRefundType" NOT NULL DEFAULT 'credit_note',
  "amount" DECIMAL(12, 2) NOT NULL,
  "refund_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payment_method" VARCHAR(60),
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "supplier_refunds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_refunds_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "purchase_returns_return_number_key" ON "purchase_returns"("return_number");
CREATE INDEX "purchase_returns_purchase_id_idx" ON "purchase_returns"("purchase_id");
CREATE INDEX "purchase_returns_supplier_id_idx" ON "purchase_returns"("supplier_id");
CREATE INDEX "purchase_returns_return_date_idx" ON "purchase_returns"("return_date");
CREATE INDEX "purchase_return_items_purchase_return_id_idx" ON "purchase_return_items"("purchase_return_id");
CREATE INDEX "purchase_return_items_purchase_item_id_idx" ON "purchase_return_items"("purchase_item_id");
CREATE INDEX "purchase_return_items_product_id_idx" ON "purchase_return_items"("product_id");
CREATE INDEX "customer_refunds_customer_id_idx" ON "customer_refunds"("customer_id");
CREATE INDEX "customer_refunds_sale_id_idx" ON "customer_refunds"("sale_id");
CREATE INDEX "customer_refunds_refund_date_idx" ON "customer_refunds"("refund_date");
CREATE INDEX "supplier_refunds_supplier_id_idx" ON "supplier_refunds"("supplier_id");
CREATE INDEX "supplier_refunds_purchase_id_idx" ON "supplier_refunds"("purchase_id");
CREATE INDEX "supplier_refunds_refund_date_idx" ON "supplier_refunds"("refund_date");
CREATE INDEX "supplier_refunds_type_idx" ON "supplier_refunds"("type");

ALTER TABLE "purchase_returns"
  ADD CONSTRAINT "purchase_returns_purchase_id_fkey"
  FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_returns"
  ADD CONSTRAINT "purchase_returns_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_returns"
  ADD CONSTRAINT "purchase_returns_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_return_items"
  ADD CONSTRAINT "purchase_return_items_purchase_return_id_fkey"
  FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchase_return_items"
  ADD CONSTRAINT "purchase_return_items_purchase_item_id_fkey"
  FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_return_items"
  ADD CONSTRAINT "purchase_return_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_refunds"
  ADD CONSTRAINT "customer_refunds_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_refunds"
  ADD CONSTRAINT "customer_refunds_sale_id_fkey"
  FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_refunds"
  ADD CONSTRAINT "customer_refunds_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supplier_refunds"
  ADD CONSTRAINT "supplier_refunds_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_refunds"
  ADD CONSTRAINT "supplier_refunds_purchase_id_fkey"
  FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supplier_refunds"
  ADD CONSTRAINT "supplier_refunds_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
