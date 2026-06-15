CREATE TABLE "supplier_product_settlements" (
  "id" SERIAL NOT NULL,
  "supplier_id" INTEGER NOT NULL,
  "purchase_id" INTEGER,
  "product_id" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_cost" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "amount" DECIMAL(12, 2) NOT NULL,
  "settlement_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_product_settlements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_product_settlements_supplier_id_idx" ON "supplier_product_settlements"("supplier_id");
CREATE INDEX "supplier_product_settlements_purchase_id_idx" ON "supplier_product_settlements"("purchase_id");
CREATE INDEX "supplier_product_settlements_product_id_idx" ON "supplier_product_settlements"("product_id");
CREATE INDEX "supplier_product_settlements_settlement_date_idx" ON "supplier_product_settlements"("settlement_date");

ALTER TABLE "supplier_product_settlements"
  ADD CONSTRAINT "supplier_product_settlements_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_product_settlements"
  ADD CONSTRAINT "supplier_product_settlements_purchase_id_fkey"
  FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supplier_product_settlements"
  ADD CONSTRAINT "supplier_product_settlements_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_product_settlements"
  ADD CONSTRAINT "supplier_product_settlements_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supplier_product_settlements"
  ADD CONSTRAINT "supplier_product_settlements_quantity_check" CHECK ("quantity" > 0);

ALTER TABLE "supplier_product_settlements"
  ADD CONSTRAINT "supplier_product_settlements_unit_cost_check" CHECK ("unit_cost" >= 0);

ALTER TABLE "supplier_product_settlements"
  ADD CONSTRAINT "supplier_product_settlements_amount_check" CHECK ("amount" >= 0);

CREATE TABLE "supplier_product_settlement_allocations" (
  "id" SERIAL NOT NULL,
  "settlement_id" INTEGER NOT NULL,
  "purchase_id" INTEGER NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_product_settlement_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_product_settlement_allocations_settlement_id_idx" ON "supplier_product_settlement_allocations"("settlement_id");
CREATE INDEX "supplier_product_settlement_allocations_purchase_id_idx" ON "supplier_product_settlement_allocations"("purchase_id");

ALTER TABLE "supplier_product_settlement_allocations"
  ADD CONSTRAINT "supplier_product_settlement_allocations_settlement_id_fkey"
  FOREIGN KEY ("settlement_id") REFERENCES "supplier_product_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_product_settlement_allocations"
  ADD CONSTRAINT "supplier_product_settlement_allocations_purchase_id_fkey"
  FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_product_settlement_allocations"
  ADD CONSTRAINT "supplier_product_settlement_allocations_amount_check" CHECK ("amount" > 0);
