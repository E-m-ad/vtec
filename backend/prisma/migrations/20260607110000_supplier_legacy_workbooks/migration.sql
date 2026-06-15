CREATE TABLE "supplier_legacy_workbooks" (
  "id" SERIAL NOT NULL,
  "supplier_id" INTEGER NOT NULL,
  "original_file_name" VARCHAR(255) NOT NULL,
  "stored_file_name" VARCHAR(255) NOT NULL,
  "file_size_bytes" INTEGER NOT NULL,
  "checksum_sha256" VARCHAR(64) NOT NULL,
  "sheet_count" INTEGER NOT NULL DEFAULT 0,
  "uploaded_by" INTEGER,
  "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "supplier_legacy_workbooks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_legacy_workbooks_stored_file_name_key" ON "supplier_legacy_workbooks"("stored_file_name");
CREATE INDEX "supplier_legacy_workbooks_supplier_id_idx" ON "supplier_legacy_workbooks"("supplier_id");
CREATE INDEX "supplier_legacy_workbooks_uploaded_at_idx" ON "supplier_legacy_workbooks"("uploaded_at");
CREATE INDEX "supplier_legacy_workbooks_deleted_at_idx" ON "supplier_legacy_workbooks"("deleted_at");

ALTER TABLE "supplier_legacy_workbooks"
  ADD CONSTRAINT "supplier_legacy_workbooks_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_legacy_workbooks"
  ADD CONSTRAINT "supplier_legacy_workbooks_uploaded_by_fkey"
  FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supplier_legacy_workbooks"
  ADD CONSTRAINT "supplier_legacy_workbooks_file_size_bytes_check" CHECK ("file_size_bytes" > 0);

ALTER TABLE "supplier_legacy_workbooks"
  ADD CONSTRAINT "supplier_legacy_workbooks_sheet_count_check" CHECK ("sheet_count" >= 0);
