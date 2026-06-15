ALTER TABLE "supplier_payments"
  DROP CONSTRAINT "supplier_payments_supplier_id_fkey";

ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
