-- Inventory count sessions for fast barcode stock takes.
CREATE TYPE "InventoryCountStatus" AS ENUM ('counting', 'reviewed', 'applied', 'cancelled');

CREATE TABLE "inventory_count_sessions" (
  "id" SERIAL NOT NULL,
  "count_number" VARCHAR(120) NOT NULL,
  "status" "InventoryCountStatus" NOT NULL DEFAULT 'counting',
  "scope_type" VARCHAR(60) NOT NULL DEFAULT 'all',
  "scope_value" VARCHAR(160),
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMPTZ(3),
  "applied_at" TIMESTAMPTZ(3),
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "inventory_count_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_count_items" (
  "id" SERIAL NOT NULL,
  "session_id" INTEGER NOT NULL,
  "product_id" INTEGER NOT NULL,
  "system_quantity_snapshot" INTEGER NOT NULL DEFAULT 0,
  "counted_quantity" INTEGER NOT NULL DEFAULT 0,
  "scanned_count" INTEGER NOT NULL DEFAULT 0,
  "is_counted" BOOLEAN NOT NULL DEFAULT false,
  "unit_cost" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "added_from_scan" BOOLEAN NOT NULL DEFAULT false,
  "last_scanned_at" TIMESTAMPTZ(3),
  "notes" TEXT,
  "counted_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "inventory_count_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_count_sessions_count_number_key"
  ON "inventory_count_sessions"("count_number");

CREATE INDEX "inventory_count_sessions_status_idx"
  ON "inventory_count_sessions"("status");

CREATE INDEX "inventory_count_sessions_started_at_idx"
  ON "inventory_count_sessions"("started_at");

CREATE UNIQUE INDEX "inventory_count_items_session_id_product_id_key"
  ON "inventory_count_items"("session_id", "product_id");

CREATE INDEX "inventory_count_items_session_id_idx"
  ON "inventory_count_items"("session_id");

CREATE INDEX "inventory_count_items_product_id_idx"
  ON "inventory_count_items"("product_id");

CREATE INDEX "inventory_count_items_is_counted_idx"
  ON "inventory_count_items"("is_counted");

ALTER TABLE "inventory_count_sessions"
  ADD CONSTRAINT "inventory_count_sessions_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inventory_count_items"
  ADD CONSTRAINT "inventory_count_items_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "inventory_count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_count_items"
  ADD CONSTRAINT "inventory_count_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_count_items"
  ADD CONSTRAINT "inventory_count_items_counted_by_fkey"
  FOREIGN KEY ("counted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
