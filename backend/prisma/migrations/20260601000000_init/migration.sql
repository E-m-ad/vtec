CREATE TYPE "UserRole" AS ENUM ('admin', 'manager', 'cashier', 'inventory');
CREATE TYPE "PaymentStatus" AS ENUM ('paid', 'partial', 'unpaid', 'refunded');
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'SALE', 'ADJUSTMENT', 'SALE_RETURN', 'PURCHASE_RETURN');

CREATE TABLE "users" (
  "id" SERIAL NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "email" VARCHAR(160) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'cashier',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "categories" (
  "id" SERIAL NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brands" (
  "id" SERIAL NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suppliers" (
  "id" SERIAL NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "contact_name" VARCHAR(120),
  "phone" VARCHAR(40),
  "email" VARCHAR(160),
  "address" TEXT,
  "tax_number" VARCHAR(80),
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customers" (
  "id" SERIAL NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "phone" VARCHAR(40),
  "email" VARCHAR(160),
  "address" TEXT,
  "tax_number" VARCHAR(80),
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
  "id" SERIAL NOT NULL,
  "sku" VARCHAR(80) NOT NULL,
  "barcode" VARCHAR(120),
  "name" VARCHAR(180) NOT NULL,
  "description" TEXT,
  "category_id" INTEGER,
  "brand_id" INTEGER,
  "supplier_id" INTEGER,
  "purchase_price" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "sale_price" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "stock_quantity" INTEGER NOT NULL DEFAULT 0,
  "min_stock_level" INTEGER NOT NULL DEFAULT 0,
  "location" VARCHAR(120),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchases" (
  "id" SERIAL NOT NULL,
  "supplier_id" INTEGER,
  "invoice_number" VARCHAR(120),
  "purchase_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "total_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_items" (
  "id" SERIAL NOT NULL,
  "purchase_id" INTEGER NOT NULL,
  "product_id" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_cost" DECIMAL(12, 2) NOT NULL,
  "line_total" DECIMAL(12, 2) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales" (
  "id" SERIAL NOT NULL,
  "customer_id" INTEGER,
  "sale_number" VARCHAR(120) NOT NULL,
  "sale_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "total_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "payment_method" VARCHAR(60),
  "payment_status" "PaymentStatus" NOT NULL DEFAULT 'paid',
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_items" (
  "id" SERIAL NOT NULL,
  "sale_id" INTEGER NOT NULL,
  "product_id" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price" DECIMAL(12, 2) NOT NULL,
  "line_total" DECIMAL(12, 2) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_movements" (
  "id" SERIAL NOT NULL,
  "product_id" INTEGER NOT NULL,
  "movement_type" "StockMovementType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "previous_quantity" INTEGER NOT NULL,
  "new_quantity" INTEGER NOT NULL,
  "reference_type" VARCHAR(80),
  "reference_id" INTEGER,
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");
CREATE UNIQUE INDEX "sales_sale_number_key" ON "sales"("sale_number");
CREATE INDEX "products_category_id_idx" ON "products"("category_id");
CREATE INDEX "products_brand_id_idx" ON "products"("brand_id");
CREATE INDEX "products_supplier_id_idx" ON "products"("supplier_id");
CREATE INDEX "purchases_supplier_id_idx" ON "purchases"("supplier_id");
CREATE INDEX "purchases_purchase_date_idx" ON "purchases"("purchase_date");
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");
CREATE INDEX "sales_sale_date_idx" ON "sales"("sale_date");
CREATE INDEX "stock_movements_product_id_idx" ON "stock_movements"("product_id");
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements"("created_at");
CREATE INDEX "stock_movements_reference_type_reference_id_idx" ON "stock_movements"("reference_type", "reference_id");

ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "products" ADD CONSTRAINT "products_purchase_price_check" CHECK ("purchase_price" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_sale_price_check" CHECK ("sale_price" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_stock_quantity_check" CHECK ("stock_quantity" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_min_stock_level_check" CHECK ("min_stock_level" >= 0);
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_total_amount_check" CHECK ("total_amount" >= 0);
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_unit_cost_check" CHECK ("unit_cost" >= 0);
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_line_total_check" CHECK ("line_total" >= 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_total_amount_check" CHECK ("total_amount" >= 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_unit_price_check" CHECK ("unit_price" >= 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_line_total_check" CHECK ("line_total" >= 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_check" CHECK ("quantity" <> 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_previous_quantity_check" CHECK ("previous_quantity" >= 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_new_quantity_check" CHECK ("new_quantity" >= 0);

CREATE OR REPLACE FUNCTION prevent_untracked_stock_update()
RETURNS trigger AS $$
BEGIN
  IF NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity
     AND COALESCE(current_setting('app.stock_movement_context', true), '') <> 'enabled' THEN
    RAISE EXCEPTION 'products.stock_quantity can only be changed through the stock movement workflow';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_stock_quantity_guard
BEFORE UPDATE OF stock_quantity ON products
FOR EACH ROW
EXECUTE FUNCTION prevent_untracked_stock_update();
