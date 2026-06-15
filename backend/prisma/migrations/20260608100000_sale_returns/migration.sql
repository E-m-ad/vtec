CREATE TABLE "sale_returns" (
  "id" SERIAL NOT NULL,
  "sale_id" INTEGER NOT NULL,
  "customer_id" INTEGER,
  "return_number" VARCHAR(120) NOT NULL,
  "return_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "total_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_returns_total_amount_check" CHECK ("total_amount" >= 0)
);

CREATE TABLE "sale_return_items" (
  "id" SERIAL NOT NULL,
  "sale_return_id" INTEGER NOT NULL,
  "sale_item_id" INTEGER NOT NULL,
  "product_id" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price" DECIMAL(12, 2) NOT NULL,
  "line_total" DECIMAL(12, 2) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_return_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "sale_return_items_unit_price_check" CHECK ("unit_price" >= 0),
  CONSTRAINT "sale_return_items_line_total_check" CHECK ("line_total" >= 0)
);

CREATE UNIQUE INDEX "sale_returns_return_number_key" ON "sale_returns"("return_number");
CREATE INDEX "sale_returns_sale_id_idx" ON "sale_returns"("sale_id");
CREATE INDEX "sale_returns_customer_id_idx" ON "sale_returns"("customer_id");
CREATE INDEX "sale_returns_return_date_idx" ON "sale_returns"("return_date");
CREATE INDEX "sale_return_items_sale_return_id_idx" ON "sale_return_items"("sale_return_id");
CREATE INDEX "sale_return_items_sale_item_id_idx" ON "sale_return_items"("sale_item_id");
CREATE INDEX "sale_return_items_product_id_idx" ON "sale_return_items"("product_id");

ALTER TABLE "sale_returns"
  ADD CONSTRAINT "sale_returns_sale_id_fkey"
  FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_returns"
  ADD CONSTRAINT "sale_returns_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sale_returns"
  ADD CONSTRAINT "sale_returns_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sale_return_items"
  ADD CONSTRAINT "sale_return_items_sale_return_id_fkey"
  FOREIGN KEY ("sale_return_id") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sale_return_items"
  ADD CONSTRAINT "sale_return_items_sale_item_id_fkey"
  FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_return_items"
  ADD CONSTRAINT "sale_return_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
